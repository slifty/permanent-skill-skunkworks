import { waitForProcessing } from "../permanent/records.ts";
import { uploadFiles } from "../uploads/upload-files.ts";
import type { StoryManifest } from "../manifest/schema.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type { FolderSummary } from "../permanent/folders.ts";
import type { UploadLedger } from "../uploads/ledger.ts";

type ManifestStory = StoryManifest["stories"][number];

export interface UploadContext {
	client: PermanentClient;
	ledger: UploadLedger;
	archiveId: number;
	allowPublic: boolean;
	deadline: number;
	processingPollMilliseconds?: number | undefined;
}

const PROCESSING_POLL_MILLISECONDS = 3000;

const stillProcessing = async (
	context: UploadContext,
	recordIds: number[],
): Promise<{ processing: Set<number>; failed: Set<number> }> => {
	if (recordIds.length === 0) {
		return { processing: new Set(), failed: new Set() };
	}
	const records = await waitForProcessing(
		context.client,
		recordIds,
		context.deadline,
		context.processingPollMilliseconds ?? PROCESSING_POLL_MILLISECONDS,
	);
	const inState = (state: string): Set<number> =>
		new Set(
			records
				.filter((record) => record.state === state)
				.map((record) => record.recordId),
		);
	return { processing: inState("processing"), failed: inState("failed") };
};

const PROCESSING_FAILED =
	"Permanent couldn't process this file, so it may not show a preview";

export const settledRecords = (
	recordIdsByPath: Map<string, number>,
	processing: Set<number>,
): Map<string, number> =>
	new Map(
		[...recordIdsByPath].filter(([, recordId]) => !processing.has(recordId)),
	);

export const processingField = (
	processing: Set<number>,
): { processing?: number } =>
	processing.size > 0 ? { processing: processing.size } : {};

export const uploadStory = async (
	context: UploadContext,
	folder: FolderSummary,
	story: ManifestStory,
): Promise<{
	upload: Awaited<ReturnType<typeof uploadFiles>>;
	recordIdsByPath: Map<string, number>;
	processing: Set<number>;
	settled: boolean;
	failed: Array<{ path: string; error: string }>;
}> => {
	const upload = await uploadFiles({
		client: context.client,
		ledger: context.ledger,
		archiveId: context.archiveId,
		folderId: folder.folderId,
		paths: story.items.map((item) => item.path),
		deadline: context.deadline,
		allowPublic: context.allowPublic,
	});
	const recordIdsByPath = new Map<string, number>(
		[...upload.uploaded, ...upload.alreadyUploaded].map(
			(item): [string, number] => [item.path, item.recordId],
		),
	);
	const { processing, failed } = await stillProcessing(context, [
		...recordIdsByPath.values(),
	]);
	return {
		upload,
		recordIdsByPath,
		processing,
		failed: [
			...upload.failed,
			...[...recordIdsByPath]
				.filter(([, recordId]) => failed.has(recordId))
				.map(([path]) => ({ path, error: PROCESSING_FAILED })),
		],
		settled: upload.remaining.length === 0 && processing.size === 0,
	};
};
