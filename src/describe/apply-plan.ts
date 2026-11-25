import { runInOrder } from "../concurrency.ts";
import { edtfToDisplayDate } from "../dates/edtf.ts";
import {
	updateBackEndRecordFields,
	updateRecordDetails,
} from "../permanent/metadata.ts";
import { readRecordFields } from "../permanent/view.ts";
import { digestOf } from "../stories/progress.ts";
import { readPlan } from "./plan.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type { RecordView } from "../permanent/view.ts";
import type { StoryProgress } from "../stories/progress.ts";
import type { PlanEntry } from "./plan.ts";

type Field = "title" | "description" | "altText" | "date";

const FIELDS: Field[] = ["title", "description", "altText", "date"];

export interface PlanRequest {
	client: PermanentClient;
	progress: StoryProgress;
	path: string;
	deadline: number;
}

export interface PlanReport {
	done: boolean;
	updated: Array<{ recordId: number; fields: Field[] }>;
	keptExisting: Array<{ recordId: number; fields: Field[] }>;
	alreadyApplied: number;
	failed: Array<{ recordId: number; error: string }>;
	remaining: number;
}

const describe = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const fieldsToWrite = (
	entry: PlanEntry,
	current: RecordView,
): { write: Field[]; keep: Field[] } => {
	const proposed = FIELDS.filter((field) => entry[field] !== undefined);
	const replaceable = (field: Field): boolean =>
		entry.overwrite === true ||
		(Array.isArray(entry.overwrite) && entry.overwrite.includes(field));
	const keep = proposed.filter(
		(field) => current[field] !== undefined && !replaceable(field),
	);
	return { write: proposed.filter((field) => !keep.includes(field)), keep };
};

const writeFields = async (
	client: PermanentClient,
	archiveId: number,
	entry: PlanEntry,
	fields: Field[],
): Promise<void> => {
	const chosen = (field: Field): string | undefined =>
		fields.includes(field) ? entry[field] : undefined;
	const date = chosen("date");
	await updateRecordDetails(client, entry.recordId, {
		title: chosen("title"),
		description: chosen("description"),
		date,
	});
	await updateBackEndRecordFields(client, archiveId, entry.recordId, {
		altText: chosen("altText"),
		displayDate: date === undefined ? undefined : edtfToDisplayDate(date),
	});
};

export const applyDescriptionPlan = async (
	request: PlanRequest,
): Promise<PlanReport> => {
	const plan = await readPlan(request.path);
	const report: PlanReport = {
		done: false,
		updated: [],
		keptExisting: [],
		alreadyApplied: 0,
		failed: [],
		remaining: 0,
	};
	const progress = { processed: 0 };
	const finishedAll = await runInOrder(plan.entries, async (entry) => {
		if (Date.now() >= request.deadline) {
			return false;
		}
		progress.processed += 1;
		const key = `describe:${entry.recordId}`;
		const digest = digestOf(entry);
		if (await request.progress.isApplied(key, digest)) {
			report.alreadyApplied += 1;
			return true;
		}
		try {
			const current = await readRecordFields(
				request.client,
				plan.archiveId,
				entry.recordId,
			);
			const { write, keep } = fieldsToWrite(entry, current);
			if (write.length > 0) {
				await writeFields(request.client, plan.archiveId, entry, write);
				report.updated.push({ recordId: entry.recordId, fields: write });
			}
			if (keep.length > 0) {
				report.keptExisting.push({ recordId: entry.recordId, fields: keep });
			}
			await request.progress.markApplied(key, digest);
		} catch (error) {
			report.failed.push({ recordId: entry.recordId, error: describe(error) });
		}
		return true;
	});
	report.remaining = plan.entries.length - progress.processed;
	report.done = finishedAll && report.failed.length === 0;
	return report;
};
