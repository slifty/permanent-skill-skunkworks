import { isAbsolute } from "node:path";
import { z } from "zod";
import { isSupportedEdtf } from "../dates/edtf.ts";

export const MANIFEST_VERSION = 1;

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

const location = z.object({
	latitude: z.number().min(-MAX_LATITUDE).max(MAX_LATITUDE).optional(),
	longitude: z.number().min(-MAX_LONGITUDE).max(MAX_LONGITUDE).optional(),
	name: z
		.string()
		.optional()
		.describe("Human-readable place, e.g. 'Grandma's backyard, Austin TX'"),
});

const date = z
	.string()
	.refine(isSupportedEdtf, { error: "Not a supported EDTF date" })
	.describe(
		"EDTF date: '2024-06-01', '2024-06-01T18:30:00', '2024-06', '2024~' or '2024-06-01/2024-06-02'",
	);

const absolutePath = z
	.string()
	.refine(isAbsolute, { error: "Must be an absolute path" });

export const manifestItem = z.object({
	path: absolutePath.describe("Absolute path to the local file"),
	title: z.string().optional(),
	description: z.string().optional(),
	altText: z
		.string()
		.optional()
		.describe("What the image shows, for people using screen readers"),
	date: date.optional(),
	location: location.optional(),
	keywords: z.array(z.string()).optional(),
});

export const manifestStory = z.object({
	title: z.string().min(1),
	description: z
		.string()
		.optional()
		.describe("The story's narrative, shown with the folder on Permanent"),
	cover: absolutePath
		.optional()
		.describe("Path of the item to use as the story's cover image"),
	items: z.array(manifestItem).min(1),
});

export const storyManifest = z
	.object({
		version: z.literal(MANIFEST_VERSION),
		event: z.object({
			title: z.string().min(1),
			description: z.string().optional(),
			date: date.optional(),
			location: location.optional(),
		}),
		stories: z.array(manifestStory).min(1),
		excluded: z
			.array(z.object({ path: absolutePath, reason: z.string() }))
			.optional()
			.describe("Files deliberately left out, and why"),
	})
	.superRefine((manifest, context) => {
		const seen = new Set<string>();
		manifest.stories.forEach((story, storyIndex) => {
			story.items.forEach((item, itemIndex) => {
				if (seen.has(item.path)) {
					context.addIssue({
						code: "custom",
						message: `${item.path} appears in more than one place`,
						path: ["stories", storyIndex, "items", itemIndex, "path"],
					});
				}
				seen.add(item.path);
			});
			if (
				story.cover !== undefined &&
				!story.items.some((item) => item.path === story.cover)
			) {
				context.addIssue({
					code: "custom",
					message: `Cover ${story.cover} is not one of the story's items`,
					path: ["stories", storyIndex, "cover"],
				});
			}
		});
	});

export type StoryManifest = z.infer<typeof storyManifest>;
