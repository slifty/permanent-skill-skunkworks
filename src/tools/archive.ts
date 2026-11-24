import { z } from "zod";
import {
	findFolderNamed,
	findOrCreateFolder,
	getArchiveRoots,
	isPublicKind,
	getFolderContents,
	listArchives,
} from "../permanent/folders.ts";
import { jsonResult } from "./result.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const id = z.number().int().positive();

export const registerArchiveTools = (
	server: McpServer,
	client: PermanentClient,
): void => {
	server.registerTool(
		"list_archives",
		{
			title: "List Permanent archives",
			description:
				"List the Permanent archives the signed-in member belongs to, with their role in each. Adding files needs the contributor role or higher; publishing needs manager or owner.",
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async () => jsonResult({ archives: await listArchives(client) }),
	);

	server.registerTool(
		"browse_folder",
		{
			title: "Browse a Permanent folder",
			description:
				"Show a folder's sub-folders and files. Without a folderId, shows the archive's top-level folders: 'My Files' (root.private, where new work goes) and 'Public' (root.public, visible to everyone).",
			inputSchema: {
				archiveId: id,
				folderId: id.optional(),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ archiveId, folderId }) =>
			jsonResult(
				folderId === undefined
					? await getArchiveRoots(client, archiveId)
					: await getFolderContents(client, archiveId, folderId),
			),
	);

	server.registerTool(
		"create_folder",
		{
			title: "Create a Permanent folder",
			description:
				"Create a folder inside another folder. If the parent already has a folder with that name, returns the existing one instead of making a duplicate. Refuses to create inside Public, where everything is visible to everyone, unless allowPublic is set after the member has agreed.",
			inputSchema: {
				archiveId: id,
				parentFolderId: id,
				name: z.string().trim().min(1),
				allowPublic: z
					.boolean()
					.default(false)
					.describe("Only after the member agreed to make this folder public"),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async ({ archiveId, parentFolderId, name, allowPublic }) => {
			const parent = await getFolderContents(client, archiveId, parentFolderId);
			const existing = findFolderNamed(parent, name);
			if (existing !== undefined) {
				return jsonResult({ created: false, folder: existing });
			}
			if (isPublicKind(parent.kind) && !allowPublic) {
				throw new Error(
					`"${parent.name}" is public: anything created there is visible to everyone. Create the folder in My Files instead, or ask the member before passing allowPublic.`,
				);
			}
			return jsonResult(await findOrCreateFolder(client, parent, name));
		},
	);
};
