import { z } from "zod";
import { downloadOriginal } from "../permanent/download.ts";
import { jsonResult } from "./result.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const id = z.number().int().positive();

export const registerDownloadTools = (
	server: McpServer,
	client: PermanentClient,
	downloadDirectory: string,
): void => {
	server.registerTool(
		"download_record_file",
		{
			title: "Download a Permanent file",
			description:
				"Download the original of a file that's already on Permanent to the member's computer, and return where it was saved. Use it when the preview isn't enough, such as reading every page of a PDF. Files over 100 MB are refused. The copy stays private to this computer.",
			inputSchema: { recordId: id },
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async ({ recordId }) =>
			jsonResult(await downloadOriginal(client, recordId, downloadDirectory)),
	);
};
