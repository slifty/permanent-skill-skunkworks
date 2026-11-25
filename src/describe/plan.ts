import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { isSupportedEdtf } from "../dates/edtf.ts";
import { writeFileAtomically } from "../files.ts";

export const PLAN_VERSION = 1;

const planEntry = z.object({
	recordId: z.number().int().positive(),
	fileName: z
		.string()
		.optional()
		.describe("The record's file name, to help the member review the plan"),
	title: z.string().trim().min(1).optional(),
	description: z.string().optional(),
	altText: z.string().optional(),
	date: z
		.string()
		.refine(isSupportedEdtf, { error: "Not a supported EDTF date" })
		.optional(),
	overwrite: z
		.union([
			z.boolean(),
			z.array(z.enum(["title", "description", "altText", "date"])),
		])
		.default(false)
		.describe(
			'Fields to replace even though they already have a value: true for all, or a list. Every record already has a date (at least its upload time), so a new date needs "date" here.',
		),
});

export const descriptionPlan = z
	.object({
		version: z.literal(PLAN_VERSION),
		archiveId: z.number().int().positive(),
		entries: z.array(planEntry).min(1),
	})
	.superRefine((plan, context) => {
		const seen = new Set<number>();
		plan.entries.forEach((entry, index) => {
			if (seen.has(entry.recordId)) {
				context.addIssue({
					code: "custom",
					message: `Record ${entry.recordId} appears more than once`,
					path: ["entries", index, "recordId"],
				});
			}
			seen.add(entry.recordId);
		});
	});

export type DescriptionPlan = z.infer<typeof descriptionPlan>;
export type PlanEntry = DescriptionPlan["entries"][number];

const JSON_INDENT = "\t";

const requireAbsolute = (path: string): string => {
	if (!isAbsolute(path)) {
		throw new Error(`Use an absolute path, not "${path}"`);
	}
	return path;
};

export const readPlan = async (path: string): Promise<DescriptionPlan> =>
	descriptionPlan.parse(
		JSON.parse(await readFile(requireAbsolute(path), "utf8")),
	);

export const writePlan = async (
	path: string,
	plan: DescriptionPlan,
): Promise<string> => {
	const fullPath = requireAbsolute(path);
	await writeFileAtomically(
		fullPath,
		`${JSON.stringify(descriptionPlan.parse(plan), null, JSON_INDENT)}\n`,
	);
	return fullPath;
};
