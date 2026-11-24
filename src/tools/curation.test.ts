import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { callTool, connectClient } from "../testing/client.ts";
import { buildJpeg } from "../testing/jpeg.ts";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

interface Fixture {
	client: Client;
	root: string;
	photo: string;
}

const setUp = async (): Promise<Fixture> => {
	const root = await mkdtemp(join(tmpdir(), "curation-test-"));
	const photo = join(root, "arrival.jpg");
	await writeFile(
		photo,
		buildJpeg({ dateTimeOriginal: "2024:06:01 14:00:00" }),
	);
	return { client: await connectClient(), root, photo };
};

const manifestFor = (photo: string, cover = photo): object => ({
	version: 1,
	event: { title: "Grandma's 90th", date: "2024-06-01" },
	stories: [
		{
			title: "Arrivals",
			description: "Everyone got to the house by two.",
			cover,
			items: [{ path: photo, altText: "A family hugging on a porch" }],
		},
	],
});

describe("curation tools", () => {
	it("lists the curation tools with annotations", async () => {
		const { client } = await setUp();

		const { tools } = await client.listTools();

		expect(
			Object.fromEntries(
				tools.map((tool) => [tool.name, tool.annotations?.readOnlyHint]),
			),
		).toEqual({
			scan_photos: true,
			save_story_manifest: false,
			read_story_manifest: true,
		});
	});

	it("scans photos without exposing file hashes", async () => {
		const { client, root, photo } = await setUp();

		const outcome = await callTool(client, "scan_photos", { paths: [root] });

		expect(outcome.isError).toBe(false);
		expect(outcome.json()).toMatchObject({
			summary: { files: 1 },
			items: [{ path: photo, takenAt: "2024-06-01T14:00:00" }],
		});
		expect(outcome.text).not.toContain("sha256");
	});

	it("refuses relative paths to scan", async () => {
		const { client } = await setUp();

		const outcome = await callTool(client, "scan_photos", {
			paths: ["Pictures/party"],
		});

		expect(outcome.isError).toBe(true);
		expect(outcome.text).toContain("Use an absolute path");
	});

	it("saves a manifest that can be read back", async () => {
		const { client, root, photo } = await setUp();
		const manifestPath = join(root, "story-manifest.json");

		const saved = await callTool(client, "save_story_manifest", {
			path: manifestPath,
			manifest: manifestFor(photo),
		});
		const read = await callTool(client, "read_story_manifest", {
			path: manifestPath,
		});

		expect(saved.isError).toBe(false);
		expect(read.json()).toEqual(manifestFor(photo));
		expect(await readFile(manifestPath, "utf8")).toContain("Arrivals");
		expect((await stat(manifestPath)).mode & 0o777).toBe(0o600);
	});

	it("rejects a cover that is not in the story", async () => {
		const { client, root, photo } = await setUp();

		const outcome = await callTool(client, "save_story_manifest", {
			path: join(root, "story-manifest.json"),
			manifest: manifestFor(photo, join(root, "elsewhere.jpg")),
		});

		expect(outcome.isError).toBe(true);
		expect(outcome.text).toContain("is not one of the story's items");
	});

	it("rejects dates that are not EDTF and relative paths", async () => {
		const { client, root, photo } = await setUp();

		const outcome = await callTool(client, "save_story_manifest", {
			path: join(root, "story-manifest.json"),
			manifest: {
				version: 1,
				event: { title: "Party", date: "last Saturday" },
				stories: [{ title: "Arrivals", items: [{ path: "arrival.jpg" }] }],
			},
		});

		expect(outcome.isError).toBe(true);
		expect(outcome.text).toContain("Not a supported EDTF date");
		expect(outcome.text).toContain("Must be an absolute path");
		expect(photo).toBeDefined();
	});

	it("reports a manifest the member broke while editing", async () => {
		const { client, root } = await setUp();
		const manifestPath = join(root, "story-manifest.json");
		await writeFile(manifestPath, '{"version": 1, "stories": []}');

		const outcome = await callTool(client, "read_story_manifest", {
			path: manifestPath,
		});

		expect(outcome.isError).toBe(true);
	});
});
