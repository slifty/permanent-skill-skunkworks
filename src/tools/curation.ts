import { isAbsolute } from "node:path";
import { z } from "zod";
import { readManifest, writeManifest } from "../manifest/file.ts";
import { storyManifest } from "../manifest/schema.ts";
import { scanMedia } from "../photos/scan.ts";
import { jsonResult } from "./result.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const DEFAULT_GAP_MINUTES = 90;

export const registerCurationTools = (server: McpServer): void => {
	server.registerTool(
		"scan_photos",
		{
			title: "Scan photos",
			description:
				"Scan local files or folders for photos and videos. Returns each file's date (from EXIF when present, otherwise the file's modified time), GPS location, camera and size, marks exact duplicates, and suggests groups of items taken close together in time. Does not upload anything.",
			inputSchema: {
				paths: z
					.array(
						z.string().refine(isAbsolute, {
							error: "Use an absolute path on this computer",
						}),
					)
					.min(1)
					.describe("Absolute paths of files or folders on this computer"),
				recursive: z.boolean().default(true).describe("Also scan sub-folders"),
				gapMinutes: z
					.number()
					.positive()
					.default(DEFAULT_GAP_MINUTES)
					.describe(
						"Start a new suggested group when this many minutes pass between items",
					),
			},
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ paths, recursive, gapMinutes }) => {
			const result = await scanMedia(paths, { recursive, gapMinutes });
			return jsonResult({
				summary: {
					files: result.items.length,
					duplicates: result.duplicates,
					withoutExifDate: result.items.filter(
						(item) => item.takenAtSource === "file",
					).length,
					suggestedGroups: result.groups.length,
				},
				items: result.items.map(({ sha256: _sha256, ...item }) => item),
				groups: result.groups,
				unsupported: result.unsupported,
				missing: result.missing,
				unreadable: result.unreadable,
			});
		},
	);

	server.registerTool(
		"save_story_manifest",
		{
			title: "Save story manifest",
			description:
				"Validate a story manifest (the event, its stories, and the items and metadata in each) and save it as JSON on this computer, replacing any existing file at that path. The manifest is what gets uploaded to Permanent later, so save it before asking the member to review it.",
			inputSchema: {
				path: z
					.string()
					.describe(
						"Where to save the manifest, e.g. <photo folder>/story-manifest.json",
					),
				manifest: storyManifest,
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ path, manifest }) => {
			const savedPath = await writeManifest(path, manifest);
			return jsonResult({
				savedPath,
				stories: manifest.stories.length,
				items: manifest.stories.reduce(
					(total, story) => total + story.items.length,
					0,
				),
			});
		},
	);

	server.registerTool(
		"read_story_manifest",
		{
			title: "Read story manifest",
			description:
				"Read and validate a story manifest saved on this computer, including any edits the member made to the file.",
			inputSchema: {
				path: z.string().describe("Path of the manifest JSON file"),
			},
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ path }) => jsonResult(await readManifest(path)),
	);
};
