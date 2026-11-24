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
});

export type ProcessingState = "ready" | "processing" | "failed";

export interface RecordProcessing {
	recordId: number;
	name?: string | undefined;
	state: ProcessingState;
	status: string;
	thumbnail?: string | undefined;
}

const stateOf = (status: string): ProcessingState => {
	if (status === READY) {
		return "ready";
	}
	return FAILED.has(status) ? "failed" : "processing";
};

export const getRecordProcessing = async (
	client: PermanentClient,
	recordIds: number[],
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
		state: stateOf(record.status),
		status: record.status.replace(/^status\./v, ""),
		thumbnail: record.thumbUrl200 ?? undefined,
	}));
};
