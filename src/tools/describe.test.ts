import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import { callTool, connectClient } from "../testing/client.ts";
import {
	FAKE_PREVIEW,
	FakeArchive,
	MY_FILES_ID,
} from "../testing/fake-archive.ts";
import { buildJpeg } from "../testing/jpeg.ts";
import { must } from "../testing/must.ts";
import { startTestPermanent } from "../testing/permanent.ts";
import type { FakeRecord } from "../testing/fake-archive.ts";
import type { TestPermanent } from "../testing/permanent.ts";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

let permanent: TestPermanent | undefined = undefined;

afterEach(async () => {
	const current = permanent;
	permanent = undefined;
	await current?.cleanUp();
});

interface Fixture {
	test: TestPermanent;
	archive: FakeArchive;
	client: Client;
	root: string;
	bare: FakeRecord;
	described: FakeRecord;
}

const setUp = async (): Promise<Fixture> => {
	const test = await startTestPermanent();
	permanent = test;
	await test.signIn();
	const archive = new FakeArchive();
	archive.install(test.fake);
	const client = await connectClient(test);
	await callTool(client, "create_folder", {
		archiveId: 7,
		parentFolderId: MY_FILES_ID,
		name: "Old scans",
	});
	const folder = must(archive.folderNamed("Old scans"));
	const root = await mkdtemp(join(tmpdir(), "describe-test-"));
	const paths = await Promise.all(
		["IMG_0001.jpg", "IMG_0002.jpg"].map(async (name, index) => {
			const path = join(root, name);
			await writeFile(
				path,
				buildJpeg({ dateTimeOriginal: `2024:06:01 1${index}:00:00` }),
			);
			return path;
		}),
	);
	await callTool(client, "upload_files", {
		archiveId: 7,
		folderId: folder.folderId,
		paths,
	});
	const records = archive.recordsIn(folder.folderId);
	const bare = must(
		records.find((record) => record.uploadFileName === "IMG_0001.jpg"),
	);
	const described = must(
		records.find((record) => record.uploadFileName === "IMG_0002.jpg"),
	);
	await callTool(client, "set_record_details", {
		archiveId: 7,
		recordId: described.recordId,
		description: "Written by the member.",
	});
	return { test, archive, client, root, bare, described };
};

describe("view_record", () => {
	it("shows the preview and leaves out empty fields and file-name titles", async () => {
		const { client, bare } = await setUp();

		const { content } = CallToolResultSchema.parse(
			await client.callTool({
				name: "view_record",
				arguments: { archiveId: 7, recordId: bare.recordId },
			}),
		);

		expect(content[0]).toMatchObject({
			type: "image",
			mimeType: "image/jpeg",
			data: FAKE_PREVIEW.toString("base64"),
		});
		const textBlock = must(content[1]);
		const details: unknown = JSON.parse(
			textBlock.type === "text" ? textBlock.text : "{}",
		);
		expect(details).toMatchObject({
			recordId: bare.recordId,
			fileName: "IMG_0001.jpg",
		});
		expect(details).not.toHaveProperty("title");
		expect(details).not.toHaveProperty("description");
	});

	it("treats a file name with an extension Permanent added as missing", async () => {
		const { client, bare } = await setUp();
		bare.uploadFileName = "IMG_0001.jpg.gif";
		bare.displayName = "IMG_0001";

		const outcome = await callTool(client, "view_record", {
			archiveId: 7,
			recordId: bare.recordId,
		});

		expect(outcome.json()).not.toHaveProperty("title");
	});

	it("treats a title that is the whole file name as missing", async () => {
		const { client, bare } = await setUp();
		bare.displayName = "IMG_0001.jpg";

		const outcome = await callTool(client, "view_record", {
			archiveId: 7,
			recordId: bare.recordId,
		});

		expect(outcome.json()).not.toHaveProperty("title");
	});

	it("falls back to another preview size when one won't load", async () => {
		const { client, archive, bare } = await setUp();
		archive.brokenPreviews.add("w1000");

		const { content } = CallToolResultSchema.parse(
			await client.callTool({
				name: "view_record",
				arguments: { archiveId: 7, recordId: bare.recordId },
			}),
		);

		expect(content[0]).toMatchObject({ type: "image" });
	});

	it("refuses a preview that is too large", async () => {
		const { client, archive, bare } = await setUp();
		archive.previewBytes = Buffer.alloc(5_000_000);

		const outcome = await callTool(client, "view_record", {
			archiveId: 7,
			recordId: bare.recordId,
		});

		expect(outcome.json()).toMatchObject({
			imageProblem: expect.stringContaining("too large") as unknown,
		});
	});
});

describe("description plans", () => {
	it("fills empty fields, keeps the member's text, and is safe to repeat", async () => {
		const { client, root, bare, described } = await setUp();
		const path = join(root, "describe-plan.json");
		const plan = {
			version: 1,
			archiveId: 7,
			entries: [
				{
					recordId: bare.recordId,
					title: "Grandma at the lake",
					description: "A summer afternoon.",
					altText: "An older woman sitting on a dock.",
					date: "1975-07",
					overwrite: ["date"],
				},
				{
					recordId: described.recordId,
					title: "The old house",
					description: "A drafted description.",
				},
			],
		};

		const saved = await callTool(client, "save_description_plan", {
			path,
			plan,
		});
		const applied = await callTool(client, "apply_description_plan", { path });
		const again = await callTool(client, "apply_description_plan", { path });

		expect(saved.isError).toBe(false);
		expect(applied.json()).toMatchObject({
			done: true,
			updated: [
				{
					recordId: bare.recordId,
					fields: ["title", "description", "altText", "date"],
				},
				{ recordId: described.recordId, fields: ["title"] },
			],
			keptExisting: [{ recordId: described.recordId, fields: ["description"] }],
			remaining: 0,
		});
		expect(bare).toMatchObject({
			displayName: "Grandma at the lake",
			description: "A summer afternoon.",
			altText: "An older woman sitting on a dock.",
			displayTime: "1975-07",
			displayDT: "1975-07-01T00:00:00",
		});
		expect(described).toMatchObject({
			displayName: "The old house",
			description: "Written by the member.",
		});
		expect(again.json()).toMatchObject({
			done: true,
			alreadyApplied: 2,
			updated: [],
		});
	});

	it("replaces the member's text only when the entry says so", async () => {
		const { client, root, described } = await setUp();
		const path = join(root, "describe-plan.json");
		await callTool(client, "save_description_plan", {
			path,
			plan: {
				version: 1,
				archiveId: 7,
				entries: [
					{
						recordId: described.recordId,
						description: "Rewritten on request.",
						overwrite: true,
					},
				],
			},
		});

		await callTool(client, "apply_description_plan", { path });

		expect(described.description).toBe("Rewritten on request.");
	});

	it("stops when its time runs out and reports what's left", async () => {
		const { test, root, bare } = await setUp();
		test.applyBudgetMilliseconds = 0;
		const client = await connectClient(test);
		const path = join(root, "describe-plan.json");
		await callTool(client, "save_description_plan", {
			path,
			plan: {
				version: 1,
				archiveId: 7,
				entries: [{ recordId: bare.recordId, title: "Later" }],
			},
		});

		const outcome = await callTool(client, "apply_description_plan", { path });

		expect(outcome.json()).toMatchObject({ done: false, remaining: 1 });
	});
});
