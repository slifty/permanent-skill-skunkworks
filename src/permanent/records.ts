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

const STELA_MAX_ARRAY_ITEMS = 20;

const inBatches = <Item>(items: Item[], size: number): Item[][] =>
	Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
		items.slice(index * size, (index + 1) * size),
	);

const fetchRecords = async (
	client: PermanentClient,
	recordIds: number[],
): Promise<Array<z.infer<typeof stelaRecord>>> => {
	const response = await client.stela({
		path: "/records",
		query: { recordIds, pageSize: recordIds.length },
		schema: z.union([
			z.array(stelaRecord),
			z.object({ items: z.array(stelaRecord) }),
		]),
	});
	return Array.isArray(response) ? response : response.items;
};

export const getRecordProcessing = async (
	client: PermanentClient,
	recordIds: number[],
	now = Date.now(),
): Promise<RecordProcessing[]> => {
	const batches = await Promise.all(
		inBatches(recordIds, STELA_MAX_ARRAY_ITEMS).map(
			async (batch) => await fetchRecords(client, batch),
		),
	);
	return batches.flat().map((record) => ({
		recordId: record.recordId,
		name: record.displayName ?? undefined,
		state: stateOf(record.status, record.createdAt, now),
		status: record.status.replace(/^status\./v, ""),
		thumbnail: record.thumbUrl200 ?? undefined,
	}));
};
