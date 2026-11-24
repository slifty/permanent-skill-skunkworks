import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { callTool, connectClient } from "../testing/client.ts";
import { startTestPermanent } from "../testing/permanent.ts";
import type { TestPermanent } from "../testing/permanent.ts";

let permanent: TestPermanent | undefined = undefined;

afterEach(async () => {
	const current = permanent;
	permanent = undefined;
	await current?.cleanUp();
});

const folder = (
	folderId: number,
	displayName: string,
	type: string,
	children: object[] = [],
): object => ({
	folderId,
	folder_linkId: folderId + 100,
	displayName,
	type,
	displayDT: "2024-06-01T12:00:00",
	description: null,
	sort: "sort.display_date_asc",
	view: "folder.view.grid",
	status: "status.generic.ok",
	ChildItemVOs: children,
});

const record = (recordId: number, displayName: string): object => ({
	recordId,
	folder_linkId: recordId + 200,
	displayName,
	type: "type.record.image",
	status: "status.generic.ok",
	displayDT: "2024-06-01T14:02:11",
	uploadFileName: `${displayName}.jpg`,
	description: "",
});

const setUp = async (): Promise<TestPermanent> => {
	const test = await startTestPermanent();
	permanent = test;
	await test.signIn();
	test.fake.routes.set("GET /api/archive/getAllArchives", () => ({
		body: [
			{
				archiveId: 7,
				archiveNbr: "0a1b-0000",
				fullName: "The Ortiz Family",
				accessRole: "access.role.owner",
				type: "type.archive.family",
				status: "status.generic.ok",
			},
		],
	}));
	test.fake.routes.set("GET /api/folder/getRoot", () => ({
		body: folder(1, "Archive Root", "type.folder.root.root", [
			folder(2, "Apps", "type.folder.root.app"),
			folder(3, "My Files", "type.folder.root.private"),
			folder(4, "Public", "type.folder.root.public"),
		]),
	}));
	test.fake.routes.set("GET /api/folder/getWithChildren", ({ query }) => ({
		body: folder(
			Number(query.get("folderId")),
			"My Files",
			"type.folder.root.private",
			[
				folder(10, "Rosa's 90th", "type.folder.private"),
				record(20, "Old photo"),
			],
		),
	}));
	test.fake.routes.set("POST /api/folder/post", ({ body }) => ({
		body: folder(
			11,
			z.object({ displayName: z.string() }).parse(body).displayName,
			"type.folder.private",
		),
	}));
	return test;
};

describe("archive tools", () => {
	it("lists archives with the member's role", async () => {
		const client = await connectClient(await setUp());

		const outcome = await callTool(client, "list_archives", {});

		expect(outcome.json()).toEqual({
			archives: [
				{
					archiveId: 7,
					archiveNbr: "0a1b-0000",
					name: "The Ortiz Family",
					role: "owner",
					type: "family",
				},
			],
		});
	});

	it("shows the top-level folders when no folder is given", async () => {
		const test = await setUp();
		const client = await connectClient(test);

		const outcome = await callTool(client, "browse_folder", { archiveId: 7 });

		expect(outcome.json()).toMatchObject({
			folders: [
				{ folderId: 2, kind: "root.app" },
				{ folderId: 3, name: "My Files", kind: "root.private" },
				{ folderId: 4, name: "Public", kind: "root.public" },
			],
		});
		const [request] = test.fake.requests.filter(
			(item) => item.path === "/api/folder/getRoot",
		);
		expect(request?.headers.authorization).toBe(`Bearer ${test.token}`);
		expect(request?.headers["request-version"]).toBe("2");
	});

	it("separates sub-folders from files", async () => {
		const client = await connectClient(await setUp());

		const outcome = await callTool(client, "browse_folder", {
			archiveId: 7,
			folderId: 3,
		});

		expect(outcome.json()).toMatchObject({
			folderId: 3,
			sort: "display_date_asc",
			view: "grid",
			folders: [{ folderId: 10, name: "Rosa's 90th", kind: "private" }],
			records: [{ recordId: 20, name: "Old photo", kind: "image" }],
		});
	});

	it("reuses a folder that already exists", async () => {
		const test = await setUp();
		const client = await connectClient(test);

		const outcome = await callTool(client, "create_folder", {
			archiveId: 7,
			parentFolderId: 3,
			name: " rosa's 90TH ",
		});

		expect(outcome.json()).toMatchObject({
			created: false,
			folder: { folderId: 10 },
		});
		expect(test.fake.requests.map((item) => item.path)).not.toContain(
			"/api/folder/post",
		);
	});

	it("creates a new folder without allowing duplicates", async () => {
		const test = await setUp();
		const client = await connectClient(test);

		const outcome = await callTool(client, "create_folder", {
			archiveId: 7,
			parentFolderId: 3,
			name: "Rosa's 91st",
		});

		expect(outcome.json()).toMatchObject({
			created: true,
			folder: { folderId: 11, name: "Rosa's 91st" },
		});
		const [request] = test.fake.requests.filter(
			(item) => item.path === "/api/folder/post",
		);
		expect(request?.body).toEqual({
			displayName: "Rosa's 91st",
			parentFolderId: 3,
			failOnDuplicateName: true,
		});
	});

	it("refuses to create inside Public unless allowed", async () => {
		const test = await setUp();
		test.fake.routes.set("GET /api/folder/getWithChildren", () => ({
			body: folder(4, "Public", "type.folder.root.public"),
		}));
		const client = await connectClient(test);

		const refused = await callTool(client, "create_folder", {
			archiveId: 7,
			parentFolderId: 4,
			name: "Rosa's 90th",
		});
		const allowed = await callTool(client, "create_folder", {
			archiveId: 7,
			parentFolderId: 4,
			name: "Rosa's 90th",
			allowPublic: true,
		});

		expect(refused.isError).toBe(true);
		expect(refused.text).toContain("visible to everyone");
		expect(allowed.json()).toMatchObject({ created: true });
	});

	it("returns an existing Public folder without asking for consent", async () => {
		const test = await setUp();
		test.fake.routes.set("GET /api/folder/getWithChildren", () => ({
			body: folder(4, "Public", "type.folder.root.public", [
				folder(12, "Rosa's 90th", "type.folder.public"),
			]),
		}));
		const client = await connectClient(test);

		const outcome = await callTool(client, "create_folder", {
			archiveId: 7,
			parentFolderId: 4,
			name: "Rosa's 90th",
		});

		expect(outcome.json()).toMatchObject({
			created: false,
			folder: { folderId: 12 },
		});
	});

	it("asks for sign-in when not signed in", async () => {
		const test = await startTestPermanent();
		permanent = test;
		const client = await connectClient(test);

		const outcome = await callTool(client, "list_archives", {});

		expect(outcome.isError).toBe(true);
		expect(outcome.text).toContain("sign_in");
	});

	it("forgets an expired sign-in when Permanent rejects the token", async () => {
		const test = await setUp();
		test.fake.routes.set("GET /api/archive/getAllArchives", () => ({
			status: 401,
			body: { error: "expired" },
		}));
		const client = await connectClient(test);

		const outcome = await callTool(client, "list_archives", {});

		expect(outcome.text).toContain("sign_in");
		expect((await test.auth.status()).signedIn).toBe(false);
	});
});
