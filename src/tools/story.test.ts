import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readManifest, writeManifest } from "../manifest/file.ts";
import { callTool, connectClient } from "../testing/client.ts";
import {
	FakeArchive,
	MY_FILES_ID,
	PUBLIC_ID,
} from "../testing/fake-archive.ts";
import { buildJpeg } from "../testing/jpeg.ts";
import { must } from "../testing/must.ts";
import { startTestPermanent } from "../testing/permanent.ts";
import type { StoryManifest } from "../manifest/schema.ts";
import type { TestPermanent } from "../testing/permanent.ts";

let permanent: TestPermanent | undefined = undefined;

afterEach(async () => {
	const current = permanent;
	permanent = undefined;
	await current?.cleanUp();
});

interface Fixture {
	test: TestPermanent;
	archive: FakeArchive;
	root: string;
	photos: string[];
	manifestPath: string;
	manifest: StoryManifest;
}

const setUp = async (): Promise<Fixture> => {
	const test = await startTestPermanent();
	permanent = test;
	await test.signIn();
	const archive = new FakeArchive();
	archive.install(test.fake);
	const root = await mkdtemp(join(tmpdir(), "story-test-"));
	const photos = await Promise.all(
		["IMG_0001.jpg", "IMG_0002.jpg", "IMG_0003.jpg"].map(
			async (name, index) => {
				const path = join(root, name);
				await writeFile(
					path,
					buildJpeg({ dateTimeOriginal: `2024:06:01 1${index}:00:00` }),
				);
				return path;
			},
		),
	);
	const [arrival = "", hug = "", cake = ""] = photos;
	const manifest: StoryManifest = {
		version: 1,
		event: {
			title: "Rosa's 90th",
			description: "Family from four states came to celebrate.",
		},
		stories: [
			{
				title: "Everyone arrives",
				description: "By two o'clock the porch was full.",
				cover: hug,
				items: [
					{
						path: arrival,
						title: "The Ortiz cousins pull up",
						altText: "Two young men getting out of a red car.",
						date: "2024-06-01T10:00:00",
						keywords: ["arrivals", "cousins"],
					},
					{
						path: hug,
						title: "Rosa greets everyone",
						date: "2024-06-01T11:00:00",
						location: { name: "Austin, Texas" },
					},
				],
			},
			{
				title: "Ninety candles",
				items: [{ path: cake, title: "The cake" }],
			},
		],
	};
	const manifestPath = join(root, "story-manifest.json");
	await writeManifest(manifestPath, manifest);
	return { test, archive, root, photos, manifestPath, manifest };
};

describe("apply_story_manifest", () => {
	it("builds the event on Permanent from the manifest", async () => {
		const { test, archive, manifestPath } = await setUp();
		const client = await connectClient(test);

		const outcome = await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: MY_FILES_ID,
			manifestPath,
		});

		expect(outcome.json()).toMatchObject({
			done: true,
			stories: [
				{ title: "Everyone arrives", items: 2, onPermanent: 2, described: 2 },
				{ title: "Ninety candles", items: 1, onPermanent: 1, described: 1 },
			],
		});
		const event = must(archive.folderNamed("Rosa's 90th"));
		const arrivals = must(archive.folderNamed("Everyone arrives"));
		expect(event).toMatchObject({
			parentFolderId: MY_FILES_ID,
			description: "Family from four states came to celebrate.",
		});
		expect(arrivals).toMatchObject({
			parentFolderId: event.folderId,
			description: "By two o'clock the porch was full.",
			sort: "sort.display_date_asc",
		});
		const inArrivals = archive.recordsIn(arrivals.folderId);
		const cousins = inArrivals.find(
			(record) => record.uploadFileName === "IMG_0001.jpg",
		);
		const rosa = inArrivals.find(
			(record) => record.uploadFileName === "IMG_0002.jpg",
		);
		expect(cousins).toMatchObject({
			displayName: "The Ortiz cousins pull up",
			displayTime: "2024-06-01T10:00:00",
			altText: "Two young men getting out of a red car.",
			note: "keep me",
			tags: ["arrivals", "cousins"],
		});
		expect(must(rosa).location).toEqual({ name: "Austin, Texas" });
		expect(arrivals.thumbArchiveNbr).toBe(must(rosa).archiveNbr);
	});

	it("is safe to run again and applies the member's edits", async () => {
		const { test, archive, manifestPath, manifest } = await setUp();
		const client = await connectClient(test);
		await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: MY_FILES_ID,
			manifestPath,
		});
		const {
			stories: [first],
		} = manifest;
		must(must(first).items[0]).title = "The cousins arrive from San Antonio";
		await writeManifest(manifestPath, manifest);

		await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: MY_FILES_ID,
			manifestPath,
		});

		expect(archive.records.size).toBe(3);
		expect(
			[...archive.folders.values()].filter(
				(folder) => folder.displayName === "Rosa's 90th",
			),
		).toHaveLength(1);
		const titles = [...archive.records.values()].map(
			(record) => record.displayName,
		);
		expect(titles).toContain("The cousins arrive from San Antonio");
		const cousins = [...archive.records.values()].find(
			(record) => record.uploadFileName === "IMG_0001.jpg",
		);
		expect(cousins?.tags).toEqual(["arrivals", "cousins"]);
	});

	it("keeps a story's folder when the member renames it", async () => {
		const { test, archive, manifestPath } = await setUp();
		const client = await connectClient(test);
		const request = { archiveId: 7, parentFolderId: MY_FILES_ID, manifestPath };
		await callTool(client, "apply_story_manifest", request);
		const saved = await readManifest(manifestPath);
		const original = must(archive.folderNamed("Everyone arrives"));
		must(saved.stories[0]).title = "The guests arrive";
		await writeManifest(manifestPath, saved);

		await callTool(client, "apply_story_manifest", request);

		expect(saved.event.permanentFolderId).toBe(
			must(archive.folderNamed("Rosa's 90th")).folderId,
		);
		expect(must(saved.stories[0]).permanentFolderId).toBe(original.folderId);
		expect(archive.folderNamed("Everyone arrives")).toBeUndefined();
		expect(archive.folderNamed("The guests arrive")?.folderId).toBe(
			original.folderId,
		);
		expect(archive.records.size).toBe(3);
	});

	it("ignores a saved folder that is not inside the event", async () => {
		const { test, archive, manifestPath } = await setUp();
		const client = await connectClient(test);
		const request = { archiveId: 7, parentFolderId: MY_FILES_ID, manifestPath };
		await callTool(client, "apply_story_manifest", request);
		const saved = await readManifest(manifestPath);
		must(saved.stories[0]).permanentFolderId = MY_FILES_ID;
		await writeManifest(manifestPath, saved);

		await callTool(client, "apply_story_manifest", request);

		expect(archive.folders.get(MY_FILES_ID)?.displayName).toBe("My Files");
		expect(
			must((await readManifest(manifestPath)).stories[0]).permanentFolderId,
		).toBe(must(archive.folderNamed("Everyone arrives")).folderId);
	});

	it("is not done while an item failed, but finishes the other stories", async () => {
		const { test, archive, manifestPath } = await setUp();
		const patch = test.fake.routes.get("PATCH /api/v2/records/*");
		test.fake.routes.set("PATCH /api/v2/records/*", async (request) => {
			const record = archive.records.get(Number(request.path.split("/").pop()));
			return record?.uploadFileName === "IMG_0001.jpg"
				? { status: 500, body: { error: "temporary" } }
				: ((await patch?.(request)) ?? { body: {} });
		});
		const client = await connectClient(test);

		const outcome = await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: MY_FILES_ID,
			manifestPath,
		});

		expect(outcome.json()).toMatchObject({
			done: false,
			stories: [
				{
					title: "Everyone arrives",
					described: 1,
					failed: [{ error: expect.stringContaining("500") as unknown }],
				},
				{ title: "Ninety candles", described: 1, failed: [] },
			],
		});
	});

	it("reports progress and stops when its time runs out", async () => {
		const { test, manifestPath } = await setUp();
		test.applyBudgetMilliseconds = 0;
		const client = await connectClient(test);

		const outcome = await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: MY_FILES_ID,
			manifestPath,
		});

		expect(outcome.json()).toMatchObject({ done: false });
	});

	it("will not build in Public unless allowed", async () => {
		const { test, manifestPath } = await setUp();
		const client = await connectClient(test);

		const outcome = await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: PUBLIC_ID,
			manifestPath,
		});

		expect(outcome.isError).toBe(true);
		expect(outcome.text).toContain("visible to everyone");
	});
});

describe("set_record_details and set_folder_details", () => {
	it("updates one file and one folder", async () => {
		const { test, archive, manifestPath } = await setUp();
		const client = await connectClient(test);
		await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: MY_FILES_ID,
			manifestPath,
		});
		const candles = archive.folderNamed("Ninety candles");
		const [cake] = archive.recordsIn(candles?.folderId ?? 0);

		const record = await callTool(client, "set_record_details", {
			archiveId: 7,
			recordId: cake?.recordId,
			description: "Ninety candles, all lit at once.",
			altText: "A cake covered in lit candles.",
			keywords: ["cake"],
		});
		const folder = await callTool(client, "set_folder_details", {
			archiveId: 7,
			folderId: candles?.folderId,
			description: "The best part.",
			coverRecordId: cake?.recordId,
		});

		expect(record.isError).toBe(false);
		expect(folder.isError).toBe(false);
		expect(cake).toMatchObject({
			displayName: "The cake",
			description: "Ninety candles, all lit at once.",
			altText: "A cake covered in lit candles.",
			tags: ["cake"],
		});
		expect(candles).toMatchObject({
			description: "The best part.",
			thumbArchiveNbr: cake?.archiveNbr,
		});
	});

	it("rejects a cover from another folder", async () => {
		const { test, archive, manifestPath } = await setUp();
		const client = await connectClient(test);
		await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: MY_FILES_ID,
			manifestPath,
		});
		const candles = archive.folderNamed("Ninety candles");
		const arrivals = archive.folderNamed("Everyone arrives");
		const [elsewhere] = archive.recordsIn(arrivals?.folderId ?? 0);

		const outcome = await callTool(client, "set_folder_details", {
			archiveId: 7,
			folderId: candles?.folderId,
			coverRecordId: elsewhere?.recordId,
		});

		expect(outcome.isError).toBe(true);
	});
});
