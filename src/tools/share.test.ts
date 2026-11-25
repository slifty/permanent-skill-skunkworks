import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { callTool, connectClient } from "../testing/client.ts";
import {
	ARCHIVE,
	FakeArchive,
	MY_FILES_ID,
	PUBLIC_ID,
} from "../testing/fake-archive.ts";
import { buildJpeg } from "../testing/jpeg.ts";
import { must } from "../testing/must.ts";
import { startTestPermanent } from "../testing/permanent.ts";
import type { TestPermanent } from "../testing/permanent.ts";
import type { FakeFolder } from "../testing/fake-archive.ts";
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
	event: FakeFolder;
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
		name: "Rosa's 90th",
	});
	const root = await mkdtemp(join(tmpdir(), "share-test-"));
	const photo = join(root, "IMG_0001.jpg");
	await writeFile(photo, buildJpeg());
	const event = must(archive.folderNamed("Rosa's 90th"));
	await callTool(client, "upload_files", {
		archiveId: 7,
		folderId: event.folderId,
		paths: [photo],
	});
	return { test, archive, client, event };
};

describe("share_folder", () => {
	it("returns a share link and reuses it next time", async () => {
		const { test, archive, client, event } = await setUp();

		const first = await callTool(client, "share_folder", {
			archiveId: 7,
			folderId: event.folderId,
			access: "anyone_with_link",
		});
		const second = await callTool(client, "share_folder", {
			archiveId: 7,
			folderId: event.folderId,
			access: "anyone_with_link",
		});

		expect(first.json()).toEqual({
			folder: "Rosa's 90th",
			access: "anyone_with_link",
			created: true,
			url: `${test.environment.webUrl}/share/token-1`,
			environment: "test",
			environmentNote: expect.stringContaining(
				"not the live permanent.org",
			) as unknown,
		});
		expect(second.json()).toMatchObject({
			created: false,
			url: `${test.environment.webUrl}/share/token-1`,
		});
		expect(archive.shareLinks).toHaveLength(1);
	});

	it("makes one link even when asked twice at once", async () => {
		const { archive, client, event } = await setUp();
		const request = {
			archiveId: 7,
			folderId: event.folderId,
			access: "anyone_with_link",
		};

		await Promise.all([
			callTool(client, "share_folder", request),
			callTool(client, "share_folder", request),
		]);

		expect(archive.shareLinks).toHaveLength(1);
	});

	it("makes a separate link for account-only access", async () => {
		const { archive, client, event } = await setUp();
		await callTool(client, "share_folder", {
			archiveId: 7,
			folderId: event.folderId,
			access: "anyone_with_link",
		});

		await callTool(client, "share_folder", {
			archiveId: 7,
			folderId: event.folderId,
			access: "permanent_account",
		});

		expect(archive.shareLinks.map((link) => link.accessRestrictions)).toEqual([
			"none",
			"account",
		]);
	});
});

describe("publish_folder", () => {
	it("refuses without the member's explicit agreement", async () => {
		const { archive, client, event } = await setUp();

		const outcome = await callTool(client, "publish_folder", {
			archiveId: 7,
			folderId: event.folderId,
		});

		expect(outcome.isError).toBe(true);
		expect(archive.folderNamed("Rosa's 90th")?.parentFolderId).toBe(
			MY_FILES_ID,
		);
		expect(
			[...archive.folders.values()].filter(
				(folder) => folder.parentFolderId === PUBLIC_ID,
			),
		).toHaveLength(0);
	});

	it("copies the folder into Public and returns its public page", async () => {
		const { test, archive, client, event } = await setUp();
		archive.copyDelayPolls = 2;

		const outcome = await callTool(client, "publish_folder", {
			archiveId: 7,
			folderId: event.folderId,
			memberAgreedToPublish: true,
		});

		const copy = must(
			[...archive.folders.values()].find(
				(folder) => folder.parentFolderId === PUBLIC_ID,
			),
		);
		expect(copy.displayName).toBe("Rosa's 90th");
		expect(outcome.json()).toMatchObject({
			published: true,
			url: `${test.environment.webUrl}/p/archive/${ARCHIVE.archiveNbr}/${copy.archiveNbr}/${copy.folder_linkId}`,
			environment: "test",
		});
	});

	it("does not publish the same folder twice", async () => {
		const { archive, client, event } = await setUp();
		await callTool(client, "publish_folder", {
			archiveId: 7,
			folderId: event.folderId,
			memberAgreedToPublish: true,
		});

		const again = await callTool(client, "publish_folder", {
			archiveId: 7,
			folderId: event.folderId,
			memberAgreedToPublish: true,
		});

		expect(again.json()).toMatchObject({ alreadyPublic: true });
		expect(
			[...archive.folders.values()].filter(
				(folder) => folder.parentFolderId === PUBLIC_ID,
			),
		).toHaveLength(1);
	});

	it("tells its own copy apart from an unrelated public folder with the same name", async () => {
		const { client, event, archive } = await setUp();
		await callTool(client, "create_folder", {
			archiveId: 7,
			parentFolderId: PUBLIC_ID,
			name: "Rosa's 90th",
			allowPublic: true,
		});
		const unrelated = must(
			[...archive.folders.values()].find(
				(folder) => folder.parentFolderId === PUBLIC_ID,
			),
		);

		const outcome = await callTool(client, "publish_folder", {
			archiveId: 7,
			folderId: event.folderId,
			memberAgreedToPublish: true,
		});

		const copies = [...archive.folders.values()].filter(
			(folder) => folder.parentFolderId === PUBLIC_ID,
		);
		const copy = must(
			copies.find((folder) => folder.folderId !== unrelated.folderId),
		);
		expect(copies).toHaveLength(2);
		expect(outcome.text).toContain(`/${copy.folder_linkId}`);
	});

	it("remembers its public copy after the original is renamed", async () => {
		const { client, event, archive } = await setUp();
		const request = {
			archiveId: 7,
			folderId: event.folderId,
			memberAgreedToPublish: true,
		};
		await callTool(client, "publish_folder", request);
		must(archive.folders.get(event.folderId)).displayName = "Grandma's 90th";

		const again = await callTool(client, "publish_folder", request);

		expect(again.json()).toMatchObject({ alreadyPublic: true });
		expect(
			[...archive.folders.values()].filter(
				(folder) => folder.parentFolderId === PUBLIC_ID,
			),
		).toHaveLength(1);
	});

	it("does not start a second copy while the first is still running", async () => {
		const { test, event, archive } = await setUp();
		test.publishWaitMilliseconds = 30;
		archive.copyDelayPolls = 1000;
		const client = await connectClient(test);
		const request = {
			archiveId: 7,
			folderId: event.folderId,
			memberAgreedToPublish: true,
		};

		const first = await callTool(client, "publish_folder", request);
		const second = await callTool(client, "publish_folder", request);

		expect(first.json()).toMatchObject({
			published: false,
			stillCopying: true,
		});
		expect(second.json()).toMatchObject({ stillCopying: true });
		expect(archive.queuedCopies).toBe(1);
	});

	it("lets a failed copy request be retried straight away", async () => {
		const { test, client, event, archive } = await setUp();
		const copy = test.fake.routes.get("POST /api/folder/copy");
		test.fake.routes.set("POST /api/folder/copy", () => ({
			body: {
				isSuccessful: false,
				Results: [
					{ data: null, message: ["error.generic.fail"], status: false },
				],
			},
		}));
		const request = {
			archiveId: 7,
			folderId: event.folderId,
			memberAgreedToPublish: true,
		};

		const failed = await callTool(client, "publish_folder", request);
		test.fake.routes.set("POST /api/folder/copy", must(copy));
		const retried = await callTool(client, "publish_folder", request);

		expect(failed.isError).toBe(true);
		expect(retried.json()).toMatchObject({ published: true });
		expect(
			[...archive.folders.values()].filter(
				(folder) => folder.parentFolderId === PUBLIC_ID,
			),
		).toHaveLength(1);
	});

	it("needs the owner or manager role", async () => {
		const { test, client, event } = await setUp();
		test.fake.routes.set("GET /api/archive/getAllArchives", () => ({
			body: [{ ...ARCHIVE, accessRole: "access.role.contributor" }],
		}));

		const outcome = await callTool(client, "publish_folder", {
			archiveId: 7,
			folderId: event.folderId,
			memberAgreedToPublish: true,
		});

		expect(outcome.isError).toBe(true);
		expect(outcome.text).toContain("owner or manager");
	});
});
