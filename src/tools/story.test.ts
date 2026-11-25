import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { readManifest, writeManifest } from "../manifest/file.ts";
import { digestOf } from "../stories/progress.ts";
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

const markDescribedByOldVersion = async (
	test: TestPermanent,
	archive: FakeArchive,
	items: StoryManifest["stories"][number]["items"],
	record: { recordId: number; uploadFileName: string },
): Promise<void> => {
	archive.resetDisplayDate(record.recordId, "2026-11-25T12:00:00");
	const item = must(
		items.find((candidate) => candidate.path.endsWith(record.uploadFileName)),
	);
	const { keywords: _keywords, ...details } = item;
	await test.progress.markApplied(
		`record:${record.recordId}`,
		digestOf(details),
	);
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
		expect(cousins?.displayDT).toBe("2024-06-01T10:00:00");
		expect(must(rosa).displayDT).toBe("2024-06-01T11:00:00");
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

	it("sets dates on items an earlier version already described", async () => {
		const { test, archive, manifestPath, manifest } = await setUp();
		const client = await connectClient(test);
		const request = { archiveId: 7, parentFolderId: MY_FILES_ID, manifestPath };
		await callTool(client, "apply_story_manifest", request);
		const items = manifest.stories.flatMap((story) => story.items);
		await Promise.all(
			[...archive.records.values()].map(async (record) => {
				await markDescribedByOldVersion(test, archive, items, record);
			}),
		);

		await callTool(client, "apply_story_manifest", request);

		const dated = [...archive.records.values()].find(
			(record) => record.uploadFileName === "IMG_0001.jpg",
		);
		expect(dated?.displayDT).toBe("2024-06-01T10:00:00");
	});

	it("re-presents a story whose folder lost its narrative or order", async () => {
		const { test, archive, manifestPath } = await setUp();
		const client = await connectClient(test);
		const request = { archiveId: 7, parentFolderId: MY_FILES_ID, manifestPath };
		await callTool(client, "apply_story_manifest", request);
		const arrivals = must(archive.folderNamed("Everyone arrives"));
		arrivals.description = null;
		arrivals.sort = "sort.alphabetical_asc";

		await callTool(client, "apply_story_manifest", request);

		expect(arrivals).toMatchObject({
			description: "By two o'clock the porch was full.",
			sort: "sort.display_date_asc",
		});
	});

	it("reports an event folder whose presentation Permanent didn't keep", async () => {
		const { test, archive, manifestPath } = await setUp();
		const sort = must(test.fake.routes.get("POST /api/folder/sort"));
		test.fake.routes.set("POST /api/folder/sort", async (request) => {
			const event = archive.folderNamed("Rosa's 90th");
			const raw = JSON.stringify(request.body);
			return event !== undefined &&
				raw.includes(`"folder_linkId":${event.folder_linkId}`)
				? {
						body: {
							isSuccessful: true,
							Results: [{ data: [], message: ["ok"], status: true }],
						},
					}
				: await sort(request);
		});
		const client = await connectClient(test);

		const outcome = await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: MY_FILES_ID,
			manifestPath,
		});

		expect(outcome.isError).toBe(false);
		expect(outcome.json()).toMatchObject({
			done: false,
			eventProblem: expect.stringContaining("didn't keep") as unknown,
		});
	});

	it("reads each story back and retries what Permanent didn't keep", async () => {
		const { test, archive, manifestPath } = await setUp();
		const patch = must(test.fake.routes.get("PATCH /api/v2/records/*"));
		const update = must(test.fake.routes.get("POST /api/record/update"));
		const dropsChanges = (path: string): boolean =>
			archive.records.get(Number(path.split("/").pop()))?.uploadFileName ===
			"IMG_0001.jpg";
		test.fake.routes.set("PATCH /api/v2/records/*", async (request) =>
			dropsChanges(request.path) ? { body: {} } : await patch(request),
		);
		test.fake.routes.set("POST /api/record/update", async (request) => {
			const { recordId } = z
				.object({ recordId: z.number() })
				.parse(request.body);
			return dropsChanges(`/${recordId}`)
				? { body: {} }
				: await update(request);
		});
		const client = await connectClient(test);
		const request = { archiveId: 7, parentFolderId: MY_FILES_ID, manifestPath };

		const first = await callTool(client, "apply_story_manifest", request);
		test.fake.routes.set("PATCH /api/v2/records/*", patch);
		test.fake.routes.set("POST /api/record/update", update);
		const second = await callTool(client, "apply_story_manifest", request);

		expect(first.json()).toMatchObject({
			done: false,
			stories: [
				{
					title: "Everyone arrives",
					mismatches: [
						{ field: "title", expected: "The Ortiz cousins pull up" },
						{ field: "date", expected: "2024-06-01" },
					],
				},
				{ title: "Ninety candles" },
			],
		});
		expect(second.json()).toMatchObject({ done: true });
	});

	it("re-uploads a file that went missing from Permanent", async () => {
		const { test, archive, manifestPath } = await setUp();
		const client = await connectClient(test);
		const request = { archiveId: 7, parentFolderId: MY_FILES_ID, manifestPath };
		await callTool(client, "apply_story_manifest", request);
		const lost = must(
			[...archive.records.values()].find(
				(record) => record.uploadFileName === "IMG_0003.jpg",
			),
		);
		archive.removeRecord(lost.recordId);

		const noticed = await callTool(client, "apply_story_manifest", request);
		const repaired = await callTool(client, "apply_story_manifest", request);

		expect(noticed.json()).toMatchObject({
			done: false,
			stories: [
				{ title: "Everyone arrives" },
				{ title: "Ninety candles", mismatches: [{ field: "missing" }] },
			],
		});
		expect(repaired.json()).toMatchObject({ done: true });
		expect(archive.records.size).toBe(3);
	});

	it("restores a story's narrative when Permanent holds a different one", async () => {
		const { test, archive, manifestPath } = await setUp();
		const client = await connectClient(test);
		const request = { archiveId: 7, parentFolderId: MY_FILES_ID, manifestPath };
		await callTool(client, "apply_story_manifest", request);
		const arrivals = must(archive.folderNamed("Everyone arrives"));
		arrivals.description = "Something else entirely.";

		const noticed = await callTool(client, "apply_story_manifest", request);
		const repaired = await callTool(client, "apply_story_manifest", request);

		expect(noticed.json()).toMatchObject({
			done: false,
			stories: [
				{ title: "Everyone arrives", mismatches: [{ field: "narrative" }] },
				{ title: "Ninety candles" },
			],
		});
		expect(repaired.json()).toMatchObject({ done: true });
		expect(arrivals.description).toBe("By two o'clock the porch was full.");
	});

	it("accepts a story with a blank narrative", async () => {
		const { test, manifestPath, manifest } = await setUp();
		must(manifest.stories[1]).description = " ";
		await writeManifest(manifestPath, manifest);
		const client = await connectClient(test);

		const outcome = await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: MY_FILES_ID,
			manifestPath,
		});

		expect(outcome.json()).toMatchObject({
			done: true,
			stories: [{ presented: true }, { presented: true }],
		});
	});

	it("reports a story whose presentation Permanent didn't keep", async () => {
		const { test, manifestPath } = await setUp();
		test.fake.routes.set("POST /api/folder/sort", () => ({
			body: {
				isSuccessful: true,
				Results: [{ data: [], message: ["ok"], status: true }],
			},
		}));
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
					presented: false,
					failed: [
						{
							path: "Everyone arrives",
							error: expect.stringContaining("didn't keep") as unknown,
						},
					],
				},
				{ title: "Ninety candles", presented: false },
			],
		});
	});

	it("waits for Permanent to process new uploads before describing them", async () => {
		const { test, archive, manifestPath } = await setUp();
		archive.processingPolls = 3;
		const client = await connectClient(test);

		const outcome = await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: MY_FILES_ID,
			manifestPath,
		});

		expect(outcome.json()).toMatchObject({ done: true });
		const arrivals = must(archive.folderNamed("Everyone arrives"));
		expect(archive.recordsIn(arrivals.folderId)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ displayName: "The Ortiz cousins pull up" }),
			]),
		);
	});

	it("leaves files Permanent is still processing for the next call", async () => {
		const { test, archive, manifestPath } = await setUp();
		archive.processingPolls = Infinity;
		test.applyBudgetMilliseconds = 1000;
		const client = await connectClient(test);
		const apply = async (): Promise<unknown> =>
			(
				await callTool(client, "apply_story_manifest", {
					archiveId: 7,
					parentFolderId: MY_FILES_ID,
					manifestPath,
				})
			).json();

		const first = await apply();
		archive.finishProcessing();
		archive.processingPolls = 0;
		test.applyBudgetMilliseconds = 100_000;
		const second = await apply();

		expect(first).toMatchObject({
			done: false,
			stories: expect.arrayContaining([
				expect.objectContaining({
					title: "Everyone arrives",
					processing: 2,
					described: 0,
					waitingFor: expect.stringContaining("processing") as unknown,
				}),
			]) as unknown,
		});
		expect(second).toMatchObject({ done: true });
		const arrivals = must(archive.folderNamed("Everyone arrives"));
		expect(arrivals.description).toBe("By two o'clock the porch was full.");
	});

	it("reports a file Permanent failed to process", async () => {
		const { test, archive, manifestPath } = await setUp();
		const client = await connectClient(test);
		const apply = async (): Promise<unknown> =>
			(
				await callTool(client, "apply_story_manifest", {
					archiveId: 7,
					parentFolderId: MY_FILES_ID,
					manifestPath,
				})
			).json();
		await apply();
		const arrivals = must(archive.folderNamed("Everyone arrives"));
		const [broken] = archive.recordsIn(arrivals.folderId);
		must(broken).status = "status.generic.error";

		const outcome = await apply();

		expect(outcome).toMatchObject({
			done: false,
			stories: expect.arrayContaining([
				expect.objectContaining({
					title: "Everyone arrives",
					failed: [
						expect.objectContaining({
							error: expect.stringContaining("couldn't process") as unknown,
						}),
					],
				}),
			]) as unknown,
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

		expect(outcome.json()).toMatchObject({
			done: false,
			notStarted: ["Everyone arrives", "Ninety candles"],
		});
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

describe("browse_folder after a story is applied", () => {
	it("lists each file once, even when Permanent repeats it per keyword", async () => {
		const { test, archive, manifestPath } = await setUp();
		const client = await connectClient(test);
		await callTool(client, "apply_story_manifest", {
			archiveId: 7,
			parentFolderId: MY_FILES_ID,
			manifestPath,
		});
		const arrivals = must(archive.folderNamed("Everyone arrives"));

		const outcome = await callTool(client, "browse_folder", {
			archiveId: 7,
			folderId: arrivals.folderId,
		});

		const listing = z
			.object({ records: z.array(z.object({ recordId: z.number() })) })
			.parse(outcome.json());
		expect(listing.records).toHaveLength(2);
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
