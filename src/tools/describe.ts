import { isAbsolute } from "node:path";
import { z } from "zod";
import { applyDescriptionPlan } from "../describe/apply-plan.ts";
import { descriptionPlan, readPlan, writePlan } from "../describe/plan.ts";
import { viewRecord } from "../permanent/view.ts";
import { jsonResult } from "./result.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type { StoryProgress } from "../stories/progress.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const APPLY_BUDGET_MILLISECONDS = 100_000;
const JSON_INDENT = 2;
const id = z.number().int().positive();
const absolutePath = z.string().refine(isAbsolute, {
	error: "Use an absolute path on this computer",
});

export interface DescribeToolDependencies {
	client: PermanentClient;
	progress: StoryProgress;
	applyBudgetMilliseconds?: number | undefined;
}

export const registerDescribeTools = (
	server: McpServer,
	{ client, progress, applyBudgetMilliseconds }: DescribeToolDependencies,
): void => {
	server.registerTool(
		"view_record",
		{
			title: "Look at a Permanent file",
			description:
				"Show a file that's already on Permanent: its preview image (so you can see it) and its current title, description, date and alt text. Fields that are empty, or a title that is just the file name, are left out.",
			inputSchema: { archiveId: id, recordId: id },
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ archiveId, recordId }): Promise<CallToolResult> => {
			const { image, ...details } = await viewRecord(
				client,
				archiveId,
				recordId,
			);
			return {
				content: [
					...(image === undefined
						? []
						: [
								{
									type: "image" as const,
									data: image.data,
									mimeType: image.mimeType,
								},
							]),
					{ type: "text", text: JSON.stringify(details, null, JSON_INDENT) },
				],
			};
		},
	);

	server.registerTool(
		"save_description_plan",
		{
			title: "Save a description plan",
			description:
				"Validate and save proposed titles, descriptions, dates and alt text for files already on Permanent, as JSON on this computer, replacing any file at that path. Nothing on Permanent changes until apply_description_plan.",
			inputSchema: { path: absolutePath, plan: descriptionPlan },
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ path, plan }) =>
			jsonResult({
				savedPath: await writePlan(path, plan),
				entries: plan.entries.length,
			}),
	);

	server.registerTool(
		"read_description_plan",
		{
			title: "Read a description plan",
			description:
				"Read and validate a saved description plan, including any edits the member made.",
			inputSchema: { path: absolutePath },
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ path }) => jsonResult(await readPlan(path)),
	);

	server.registerTool(
		"apply_description_plan",
		{
			title: "Apply a description plan to Permanent",
			description:
				"Apply an approved description plan to the files on Permanent. Fields the member already filled in are kept, unless that entry sets overwrite; kept fields are listed under keptExisting. Safe to call again. Works for a limited time per call; if `done` is false, call again.",
			inputSchema: { path: absolutePath },
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async ({ path }) =>
			jsonResult(
				await applyDescriptionPlan({
					client,
					progress,
					path,
					deadline:
						Date.now() + (applyBudgetMilliseconds ?? APPLY_BUDGET_MILLISECONDS),
				}),
			),
	);
};
