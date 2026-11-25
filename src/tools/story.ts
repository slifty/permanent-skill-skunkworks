import { isAbsolute } from "node:path";
import { z } from "zod";
import { isSupportedEdtf } from "../dates/edtf.ts";
import { findArchive, getFolderContents } from "../permanent/folders.ts";
import {
	addRecordKeywords,
	setRecordAltText,
	updateFolder,
	updateRecordDetails,
} from "../permanent/metadata.ts";
import { applyStoryManifest } from "../stories/apply-manifest.ts";
import { jsonResult } from "./result.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type { StoryProgress } from "../stories/progress.ts";
import type { UploadLedger } from "../uploads/ledger.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const APPLY_BUDGET_MILLISECONDS = 100_000;
const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

const id = z.number().int().positive();

const place = z.object({
	name: z.string().optional(),
	latitude: z.number().min(-MAX_LATITUDE).max(MAX_LATITUDE).optional(),
	longitude: z.number().min(-MAX_LONGITUDE).max(MAX_LONGITUDE).optional(),
});

export interface StoryToolDependencies {
	client: PermanentClient;
	ledger: UploadLedger;
	progress: StoryProgress;
	applyBudgetMilliseconds?: number | undefined;
}

export const registerStoryTools = (
	server: McpServer,
	{ client, ledger, progress, applyBudgetMilliseconds }: StoryToolDependencies,
): void => {
	server.registerTool(
		"apply_story_manifest",
		{
			title: "Put a story manifest on Permanent",
			description:
				"Put an approved story manifest on Permanent: creates a folder for the event inside parentFolderId and a folder per story inside it, uploads each story's files, sets titles, descriptions, dates, locations, alt text and keywords, then sets each story's narrative, cover and date order. Safe to call again: finished work is skipped, and edits made to the manifest since the last call are applied. Works for a limited time per call; if `done` is false, call again.",
			inputSchema: {
				archiveId: id,
				parentFolderId: id.describe(
					"Where the event folder goes, normally the archive's My Files folder",
				),
				manifestPath: z.string().refine(isAbsolute, {
					error: "Use an absolute path on this computer",
				}),
				allowPublic: z.boolean().default(false),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async ({ archiveId, parentFolderId, manifestPath, allowPublic }) =>
			jsonResult(
				await applyStoryManifest({
					client,
					ledger,
					progress,
					archiveId,
					parentFolderId,
					manifestPath,
					allowPublic,
					deadline:
						Date.now() + (applyBudgetMilliseconds ?? APPLY_BUDGET_MILLISECONDS),
				}),
			),
	);

	server.registerTool(
		"set_record_details",
		{
			title: "Describe a Permanent file",
			description:
				"Set a file's title, description, date (EDTF), location, alt text and keywords on Permanent. Only the fields you pass change. Keywords are added, not replaced.",
			inputSchema: {
				archiveId: id,
				recordId: id,
				title: z.string().min(1).optional(),
				description: z.string().optional(),
				date: z
					.string()
					.refine(isSupportedEdtf, { error: "Not a supported EDTF date" })
					.optional(),
				location: place.optional(),
				altText: z.string().optional(),
				keywords: z.array(z.string().min(1)).optional(),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async ({ archiveId, recordId, altText, keywords, ...details }) => {
			await updateRecordDetails(client, recordId, details);
			if (altText !== undefined) {
				await setRecordAltText(client, archiveId, recordId, altText);
			}
			if (keywords !== undefined && keywords.length > 0) {
				await addRecordKeywords(
					client,
					await findArchive(client, archiveId),
					recordId,
					keywords,
				);
			}
			return jsonResult({ updated: true, recordId });
		},
	);

	server.registerTool(
		"set_folder_details",
		{
			title: "Present a Permanent folder",
			description:
				"Set a folder's description (the story's narrative) and cover image, and sort it by date so items appear in the order of their dates.",
			inputSchema: {
				archiveId: id,
				folderId: id,
				description: z.string().optional(),
				coverRecordId: id
					.optional()
					.describe("A file in this folder to use as its cover"),
				sortByDate: z.boolean().default(true),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async ({ archiveId, folderId, description, coverRecordId, sortByDate }) => {
			const folder = await getFolderContents(client, archiveId, folderId);
			const cover = folder.records.find(
				(record) => record.recordId === coverRecordId,
			);
			if (coverRecordId !== undefined && cover?.archiveNbr === undefined) {
				throw new Error(`File ${coverRecordId} is not in this folder.`);
			}
			await updateFolder(client, await findArchive(client, archiveId), {
				folderId: folder.folderId,
				folderLinkId: folder.folderLinkId,
				archiveNbr: folder.archiveNbr,
				description,
				coverArchiveNbr: cover?.archiveNbr,
				sortByDate,
			});
			return jsonResult({ updated: true, folderId });
		},
	);
};
