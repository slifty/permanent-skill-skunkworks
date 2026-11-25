import { z } from "zod";
import type { PermanentClient } from "./api.ts";

const READY = "status.generic.ok";
const FAILED = new Set([
	"status.generic.error",
	"status.generic.manual_review",
]);

const stelaRecord = z.looseObject({
	recordId: z.coerce.number(),
	displayName: z.string().nullish(),
	status: z.string(),
	thumbUrl200: z.string().nullish(),
	createdAt: z.string().nullish(),
});

export type ProcessingState = "ready" | "processing" | "stuck" | "failed";

export const STUCK_AFTER_MILLISECONDS = 600_000;

export interface RecordProcessing {
	recordId: number;
	name?: string | undefined;
	state: ProcessingState;
	status: string;
	thumbnail?: string | undefined;
}

const stateOf = (
	status: string,
	createdAt: string | null | undefined,
	now: number,
): ProcessingState => {
	if (status === READY) {
		return "ready";
	}
	if (FAILED.has(status)) {
		return "failed";
	}
	const created = Date.parse(createdAt ?? "");
	return Number.isFinite(created) && now - created > STUCK_AFTER_MILLISECONDS
		? "stuck"
		: "processing";
};

export const getRecordProcessing = async (
	client: PermanentClient,
	recordIds: number[],
	now = Date.now(),
): Promise<RecordProcessing[]> => {
	const response = await client.stela({
		path: "/records",
		query: { recordIds, pageSize: recordIds.length },
		schema: z.union([
			z.array(stelaRecord),
			z.object({ items: z.array(stelaRecord) }),
		]),
	});
	const records = Array.isArray(response) ? response : response.items;
	return records.map((record) => ({
		recordId: record.recordId,
		name: record.displayName ?? undefined,
		state: stateOf(record.status, record.createdAt, now),
		status: record.status.replace(/^status\./v, ""),
		thumbnail: record.thumbUrl200 ?? undefined,
	}));
};
