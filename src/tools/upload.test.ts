import { chmod, mkdtemp, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { callTool, connectClient } from "../testing/client.ts";
import { buildJpeg } from "../testing/jpeg.ts";
import { startTestPermanent } from "../testing/permanent.ts";
import { UploadLedger } from "../uploads/ledger.ts";
import type { TestPermanent } from "../testing/permanent.ts";

let permanent: TestPermanent | undefined = undefined;

afterEach(async () => {
	const current = permanent;
	permanent = undefined;
	await current?.cleanUp();
});

const registerBody = z.looseObject({
	uploadFileName: z.string(),
	parentFolderId: z.number(),
	size: z.number(),
	failOnDuplicateName: z.boolean(),
	s3url: z.string().optional(),
	multipartUploadData: z
		.object({
			uploadId: z.string(),
			key: z.string(),
			parts: z.array(z.object({ PartNumber: z.number(), ETag: z.string() })),
		})
		.optional(),
});

interface Fixture {
	test: TestPermanent;
	root: string;
	registered: Array<z.infer<typeof registerBody>>;
	stored: number[];
}

const setUp = async (
	options: { existing?: string[]; folderType?: string } = {},
): Promise<Fixture> => {
	const test = await startTestPermanent();
	permanent = test;
	await test.signIn();
	const root = await mkdtemp(join(tmpdir(), "upload-test-"));
	const registered: Fixture["registered"] = [];
	const stored: number[] = [];
	const {
		fake: { apiUrl, routes },
	} = test;
	routes.set("GET /api/folder/getWithChildren", () => ({
		body: {
			folderId: 30,
			folder_linkId: 130,
			displayName: "Arrivals",
			type: options.folderType ?? "type.folder.private",
			ChildItemVOs: (options.existing ?? []).map((fileName, index) => ({
				recordId: 900 + index,
				displayName: fileName,
				uploadFileName: fileName,
				type: "type.record.image",
				status: "status.generic.ok",
			})),
		},
	}));
	routes.set("POST /api/record/getPresignedUrl", () => ({
		body: {
			destinationUrl: "https://s3.example/uploaded",
			presignedPost: {
				url: `${apiUrl}/s3`,
				fields: { key: "abc", policy: "p" },
			},
		},
	}));
	routes.set("POST /api/s3", ({ raw, headers }) => {
		stored.push(raw.length);
		expect(headers.authorization).toBeUndefined();
		return { status: 204, body: "" };
	});
	routes.set("POST /api/record/getMultipartUploadUrls", ({ body }) => {
		const { fileSizeInBytes } = z
			.object({ fileSizeInBytes: z.number() })
			.parse(body);
		const parts = Math.ceil(fileSizeInBytes / 10_485_760);
		return {
			body: {
				urls: Array.from(
					{ length: parts },
					(_, index) => `${apiUrl}/s3part/${index + 1}`,
				),
				uploadId: "upload-1",
				key: "key-1",
			},
		};
	});
	for (let part = 1; part <= 12; part += 1) {
		routes.set(`PUT /api/s3part/${part}`, ({ raw }) => {
			stored.push(raw.length);
			return { body: "", headers: { ETag: `"etag-${part}"` } };
		});
	}
	routes.set("POST /api/record/registerRecord", ({ body }) => {
		const parsed = registerBody.parse(body);
		registered.push(parsed);
		return {
			body: {
				recordId: 500 + registered.length,
				displayName: parsed.uploadFileName.replace(/\.\w+$/v, ""),
				uploadFileName: parsed.uploadFileName,
				type: "type.record.image",
				status: "status.record.uploaded",
			},
		};
	});
	return { test, root, registered, stored };
};

const photo = async (
	root: string,
	name: string,
	time: string,
): Promise<string> => {
	const path = join(root, name);
	await writeFile(path, buildJpeg({ dateTimeOriginal: `2024:06:01 ${time}` }));
	return path;
};

const uploadReport = z.object({
	uploaded: z.array(
		z.object({
			path: z.string(),
			recordId: z.number(),
			fileName: z.string(),
			warning: z.string().optional(),
		}),
	),
	alreadyUploaded: z.array(
		z.object({ path: z.string(), recordId: z.number() }),
	),
	conflicts: z.array(z.object({ path: z.string(), fileName: z.string() })),
	duplicates: z.array(z.object({ path: z.string(), sameAs: z.string() })),
	failed: z.array(z.object({ path: z.string(), error: z.string() })),
	remaining: z.array(z.string()),
});

describe("upload_files", () => {
	it("uploads files through presigned storage and registers them", async () => {
		const { test, root, registered, stored } = await setUp();
		const first = await photo(root, "IMG_0001.jpg", "14:00:00");
		const client = await connectClient(test);

		const outcome = await callTool(client, "upload_files", {
			archiveId: 7,
			folderId: 30,
			paths: [first],
		});

		const report = uploadReport.parse(outcome.json());
		expect(report.uploaded).toEqual([
			{ path: first, recordId: 501, fileName: "IMG_0001.jpg" },
		]);
		expect(stored).toHaveLength(1);
		expect(registered[0]).toMatchObject({
			parentFolderId: 30,
			s3url: "https://s3.example/uploaded",
			failOnDuplicateName: true,
		});
	});

	it("skips files it already uploaded to that folder", async () => {
		const { test, root, registered } = await setUp();
		const first = await photo(root, "IMG_0001.jpg", "14:00:00");
		const client = await connectClient(test);
		await callTool(client, "upload_files", {
			archiveId: 7,
			folderId: 30,
			paths: [first],
		});

		const again = await callTool(client, "upload_files", {
			archiveId: 7,
			folderId: 30,
			paths: [first],
		});

		expect(uploadReport.parse(again.json()).alreadyUploaded).toEqual([
			{ path: first, recordId: 501 },
		]);
		expect(registered).toHaveLength(1);
	});

	it("renames same-named files from different places and skips exact copies", async () => {
		const { test, root } = await setUp();
		const phoneA = await mkdtemp(join(root, "a-"));
		const phoneB = await mkdtemp(join(root, "b-"));
		const fromA = await photo(phoneA, "IMG_0001.jpg", "14:00:00");
		const fromB = await photo(phoneB, "IMG_0001.jpg", "15:00:00");
		const copy = await photo(phoneB, "copy.jpg", "14:00:00");
		const client = await connectClient(test);

		const outcome = await callTool(client, "upload_files", {
			archiveId: 7,
			folderId: 30,
			paths: [fromA, fromB, copy],
		});

		const report = uploadReport.parse(outcome.json());
		expect(report.uploaded.map((item) => item.fileName).sort()).toEqual([
			"IMG_0001 (2).jpg",
			"IMG_0001.jpg",
		]);
		expect(report.duplicates).toEqual([{ path: copy, sameAs: fromA }]);
	});

	it("reports a name already used by a different file on Permanent", async () => {
		const { test, root, registered } = await setUp({
			existing: ["IMG_0001.jpg"],
		});
		const first = await photo(root, "IMG_0001.jpg", "14:00:00");
		const client = await connectClient(test);

		const outcome = await callTool(client, "upload_files", {
			archiveId: 7,
			folderId: 30,
			paths: [first],
		});

		expect(uploadReport.parse(outcome.json()).conflicts).toEqual([
			{ path: first, fileName: "IMG_0001.jpg" },
		]);
		expect(registered).toHaveLength(0);
	});

	it("does not duplicate files when calls overlap", async () => {
		const { test, root, registered } = await setUp();
		const first = await photo(root, "IMG_0001.jpg", "14:00:00");
		const client = await connectClient(test);
		const request = { archiveId: 7, folderId: 30, paths: [first] };

		const [one, two] = await Promise.all([
			callTool(client, "upload_files", request),
			callTool(client, "upload_files", request),
		]);

		expect(registered).toHaveLength(1);
		const reports = [one, two].map((outcome) =>
			uploadReport.parse(outcome.json()),
		);
		expect(
			reports.map(
				(report) => report.uploaded.length + report.alreadyUploaded.length,
			),
		).toEqual([1, 1]);
	});

	it("warns when a file changes while it is uploading", async () => {
		const { test, root } = await setUp();
		const first = await photo(root, "IMG_0001.jpg", "14:00:00");
		const storage = test.fake.routes.get("POST /api/s3");
		test.fake.routes.set("POST /api/s3", (request) => {
			const later = new Date(Date.now() + 60_000);
			void utimes(first, later, later);
			return storage?.(request) ?? { body: "" };
		});
		const client = await connectClient(test);

		const outcome = await callTool(client, "upload_files", {
			archiveId: 7,
			folderId: 30,
			paths: [first],
		});

		const {
			uploaded: [uploaded],
		} = uploadReport.parse(outcome.json());
		expect(uploaded?.warning).toContain("changed while it was being uploaded");
	});

	it("reports an upload it could not record instead of calling it a failure", async () => {
		const { test, root } = await setUp();
		const first = await photo(root, "IMG_0001.jpg", "14:00:00");
		const ledgerDirectory = await mkdtemp(join(tmpdir(), "ledger-locked-"));
		test.ledger = new UploadLedger(ledgerDirectory, "test");
		await chmod(ledgerDirectory, 0o500);
		const client = await connectClient(test);

		const outcome = await callTool(client, "upload_files", {
			archiveId: 7,
			folderId: 30,
			paths: [first],
		});
		await chmod(ledgerDirectory, 0o700);

		const report = uploadReport.parse(outcome.json());
		expect(report.failed).toEqual([]);
		expect(report.uploaded[0]?.warning).toContain("couldn't record it");
	});

	it("uses multipart upload for large files", async () => {
		const { test, root, registered, stored } = await setUp();
		const video = join(root, "speech.mp4");
		await writeFile(video, Buffer.alloc(110 * 1024 * 1024 + 5));
		const client = await connectClient(test);

		await callTool(client, "upload_files", {
			archiveId: 7,
			folderId: 30,
			paths: [video],
		});

		expect(stored.reduce((total, size) => total + size, 0)).toBe(
			110 * 1024 * 1024 + 5,
		);
		expect(registered[0]?.multipartUploadData?.parts.length).toBe(12);
	});

	it("stops starting uploads when its time runs out", async () => {
		const { test, root, registered } = await setUp();
		test.uploadOptions = { uploadBudgetMilliseconds: 0 };
		const first = await photo(root, "IMG_0001.jpg", "14:00:00");
		const client = await connectClient(test);

		const outcome = await callTool(client, "upload_files", {
			archiveId: 7,
			folderId: 30,
			paths: [first],
		});

		expect(uploadReport.parse(outcome.json()).remaining).toEqual([first]);
		expect(registered).toHaveLength(0);
	});

	it("refuses public folders unless allowed", async () => {
		const { test, root } = await setUp({ folderType: "type.folder.public" });
		const first = await photo(root, "IMG_0001.jpg", "14:00:00");
		const client = await connectClient(test);

		const outcome = await callTool(client, "upload_files", {
			archiveId: 7,
			folderId: 30,
			paths: [first],
		});

		expect(outcome.isError).toBe(true);
		expect(outcome.text).toContain("visible to everyone");
	});
});

describe("check_processing", () => {
	it("waits until uploaded files are processed", async () => {
		const test = await startTestPermanent();
		permanent = test;
		await test.signIn();
		let polls = 0;
		test.fake.routes.set("GET /api/v2/records", ({ query }) => {
			polls += 1;
			expect(query.getAll("recordIds[]")).toEqual(["501", "502"]);
			expect(query.get("pageSize")).toBe("2");
			return {
				body: {
					items: [
						{
							recordId: "501",
							displayName: "a",
							status: "status.generic.ok",
							thumbUrl200: "https://thumb/a",
						},
						{
							recordId: "502",
							displayName: "b",
							status:
								polls < 3 ? "status.record.processing" : "status.generic.ok",
						},
					],
					pagination: { totalPages: 1 },
				},
			};
		});
		const client = await connectClient(test);

		const outcome = await callTool(client, "check_processing", {
			recordIds: [501, 502],
			waitSeconds: 5,
		});

		expect(outcome.json()).toMatchObject({
			ready: 2,
			processing: 0,
			failed: 0,
		});
		expect(polls).toBe(3);
	});

	it("also reads the older unpaged response", async () => {
		const test = await startTestPermanent();
		permanent = test;
		await test.signIn();
		test.fake.routes.set("GET /api/v2/records", () => ({
			body: [{ recordId: "501", status: "status.generic.ok" }],
		}));
		const client = await connectClient(test);

		const outcome = await callTool(client, "check_processing", {
			recordIds: [501],
		});

		expect(outcome.json()).toMatchObject({ ready: 1 });
	});
});
