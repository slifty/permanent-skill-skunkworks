import { isAbsolute } from "node:path";
import { z } from "zod";
import { waitForProcessing } from "../permanent/records.ts";
import { uploadFiles } from "../uploads/upload-files.ts";
import { jsonResult } from "./result.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type { UploadLedger } from "../uploads/ledger.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const UPLOAD_BUDGET_MILLISECONDS = 90_000;
const MAX_FILES_PER_CALL = 200;
const MAX_WAIT_SECONDS = 120;
const POLL_INTERVAL_MILLISECONDS = 3000;
const MILLISECONDS_PER_SECOND = 1000;

const id = z.number().int().positive();

export interface UploadToolOptions {
	uploadBudgetMilliseconds?: number;
	pollIntervalMilliseconds?: number;
}

export const registerUploadTools = (
	server: McpServer,
	client: PermanentClient,
	ledger: UploadLedger,
	options: UploadToolOptions = {},
): void => {
	server.registerTool(
		"upload_files",
		{
			title: "Upload files to Permanent",
			description:
				"Upload local files into a Permanent folder. Safe to call again with the same files: anything already uploaded to that folder is skipped. Works for a limited time per call, so if `remaining` is not empty, call again with those paths. A file whose name is already used by a different file in the folder is reported under `conflicts` and not uploaded. Refuses public folders unless allowPublic is set after the member agreed.",
			inputSchema: {
				archiveId: id,
				folderId: id,
				paths: z
					.array(
						z.string().refine(isAbsolute, {
							error: "Use an absolute path on this computer",
						}),
					)
					.min(1)
					.max(MAX_FILES_PER_CALL),
				allowPublic: z.boolean().default(false),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async ({ archiveId, folderId, paths, allowPublic }) =>
			jsonResult(
				await uploadFiles({
					client,
					ledger,
					archiveId,
					folderId,
					paths,
					allowPublic,
					deadline:
						Date.now() +
						(options.uploadBudgetMilliseconds ?? UPLOAD_BUDGET_MILLISECONDS),
				}),
			),
	);

	server.registerTool(
		"check_processing",
		{
			title: "Check Permanent processing",
			description:
				"Check whether Permanent has finished processing uploaded files (thumbnails and previews). Optionally waits until none are still processing. A file still unprocessed 10 minutes after upload is reported as `stuck`: it is saved with its details, but Permanent will not finish it on its own, so don't keep waiting for it.",
			inputSchema: {
				recordIds: z.array(id).min(1).max(MAX_FILES_PER_CALL),
				waitSeconds: z.number().min(0).max(MAX_WAIT_SECONDS).default(0),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ recordIds, waitSeconds }) => {
			const records = await waitForProcessing(
				client,
				recordIds,
				Date.now() + waitSeconds * MILLISECONDS_PER_SECOND,
				options.pollIntervalMilliseconds ?? POLL_INTERVAL_MILLISECONDS,
			);
			return jsonResult({
				ready: records.filter((record) => record.state === "ready").length,
				processing: records.filter((record) => record.state === "processing")
					.length,
				stuck: records.filter((record) => record.state === "stuck").length,
				failed: records.filter((record) => record.state === "failed").length,
				records,
			});
		},
	);
};
