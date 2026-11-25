import { z } from "zod";
import { findArchive } from "../permanent/folders.ts";
import {
	BLURB_MAX_LENGTH,
	MILESTONE_DESCRIPTION_MAX_LENGTH,
	MILESTONE_TITLE_MAX_LENGTH,
	readArchiveProfile,
	updateArchiveProfile,
} from "../permanent/profile.ts";
import { jsonResult } from "./result.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const id = z.number().int().positive();
const day = z.iso
	.date()
	.describe("A full date, YYYY-MM-DD. Leave it out if the day isn't known.");

const milestone = z.object({
	title: z.string().trim().min(1).max(MILESTONE_TITLE_MAX_LENGTH),
	date: day.optional(),
	endDate: day.optional(),
	description: z
		.string()
		.trim()
		.max(MILESTONE_DESCRIPTION_MAX_LENGTH)
		.optional(),
});

export const registerProfileTools = (
	server: McpServer,
	client: PermanentClient,
): void => {
	server.registerTool(
		"get_archive_profile",
		{
			title: "Read an archive's profile",
			description:
				"Read an archive's profile: the short blurb, the longer 'about' text and its milestones. isPublic says whether any of it is shown on the archive's public profile page, and publicFields lists which parts are. Changing a public field changes what everyone sees.",
			inputSchema: { archiveId: id },
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		async ({ archiveId }) =>
			jsonResult(
				await readArchiveProfile(client, await findArchive(client, archiveId)),
			),
	);

	server.registerTool(
		"set_archive_profile",
		{
			title: "Set an archive's profile",
			description:
				"Set an archive's blurb, 'about' text and milestones. Only the fields passed are changed. A milestone with the same title as an existing one updates it; others are added. Nothing is removed. New items are private until the member makes the profile public in Permanent. Needs the owner or manager role. Only call after the member has approved the exact text.",
			inputSchema: {
				archiveId: id,
				blurb: z.string().trim().min(1).max(BLURB_MAX_LENGTH).optional(),
				about: z.string().trim().min(1).optional(),
				milestones: z.array(milestone).optional(),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async ({ archiveId, ...changes }) =>
			jsonResult(
				await updateArchiveProfile(
					client,
					await findArchive(client, archiveId),
					changes,
				),
			),
	);
};
