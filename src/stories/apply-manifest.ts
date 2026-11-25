import { runInOrder } from "../concurrency.ts";
import { edtfToDisplayDate } from "../dates/edtf.ts";
import { readManifest, writeManifest } from "../manifest/file.ts";
import {
	findArchive,
	findOrCreateFolder,
	getFolderContents,
	isPublicKind,
} from "../permanent/folders.ts";
import {
	addRecordKeywords,
	updateBackEndRecordFields,
	updateFolder,
	updateRecordDetails,
} from "../permanent/metadata.ts";
import { uploadFiles } from "../uploads/upload-files.ts";
import { checkStoryOnPermanent } from "./verify.ts";
import { digestOf } from "./progress.ts";
import type { StoryManifest } from "../manifest/schema.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type {
	ArchiveSummary,
	FolderContents,
	FolderSummary,
} from "../permanent/folders.ts";
import type { UploadLedger } from "../uploads/ledger.ts";
import type { Mismatch } from "./verify.ts";
import type { StoryProgress } from "./progress.ts";

type ManifestStory = StoryManifest["stories"][number];
type ManifestItem = ManifestStory["items"][number];

export interface ApplyRequest {
	client: PermanentClient;
	ledger: UploadLedger;
	progress: StoryProgress;
	archiveId: number;
	parentFolderId: number;
	manifestPath: string;
	allowPublic: boolean;
	deadline: number;
}

interface ApplyContext extends ApplyRequest {
	archive: ArchiveSummary;
	manifest: StoryManifest;
}

export interface StoryReport {
	title: string;
	folderId: number;
	items: number;
	onPermanent: number;
	described: number;
	conflicts: Array<{ path: string; fileName: string }>;
	failed: Array<{ path: string; error: string }>;
	recordIds: number[];
	presented?: boolean;
	mismatches?: Mismatch[];
}

export interface ApplyReport {
	done: boolean;
	eventFolderId: number;
	eventProblem?: string;
	stories: StoryReport[];
}

interface DescribeOutcome {
	described: number;
	failed: Array<{ path: string; error: string }>;
	finished: boolean;
}

const describe = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const timeLeft = (context: ApplyContext): boolean =>
	Date.now() < context.deadline;

const resolveFolder = async (
	context: ApplyContext,
	parent: FolderContents,
	title: string,
	knownFolderId: number | undefined,
): Promise<FolderSummary> => {
	const known = parent.folders.find(
		(folder) => folder.folderId === knownFolderId,
	);
	if (known === undefined) {
		return (await findOrCreateFolder(context.client, parent, title)).folder;
	}
	if (known.name !== title) {
		await updateFolder(context.client, context.archive, {
			folderId: known.folderId,
			folderLinkId: known.folderLinkId,
			archiveNbr: known.archiveNbr,
			name: title,
		});
	}
	return { ...known, name: title };
};

const applyKeywords = async (
	context: ApplyContext,
	recordId: number,
	keywords: string[],
): Promise<void> => {
	const keyFor = (keyword: string): string =>
		`keyword:${recordId}:${keyword.trim().toLowerCase()}`;
	const unique = [...new Set(keywords.map((keyword) => keyword.trim()))];
	const added = await Promise.all(
		unique.map(
			async (keyword) =>
				await context.progress.isApplied(keyFor(keyword), "added"),
		),
	);
	const missing = unique.filter((_keyword, index) => added[index] !== true);
	await addRecordKeywords(context.client, context.archive, recordId, missing);
	await Promise.all(
		missing.map(async (keyword) => {
			await context.progress.markApplied(keyFor(keyword), "added");
		}),
	);
};

const ITEM_METADATA_VERSION = 2;

const applyItemMetadata = async (
	context: ApplyContext,
	recordId: number,
	item: ManifestItem,
): Promise<void> => {
	const { keywords = [], ...details } = item;
	const key = `record:${recordId}`;
	const digest = digestOf({ version: ITEM_METADATA_VERSION, details });
	if (!(await context.progress.isApplied(key, digest))) {
		await updateRecordDetails(context.client, recordId, {
			title: details.title,
			description: details.description,
			date: details.date,
			location: details.location,
		});
		await updateBackEndRecordFields(
			context.client,
			context.archiveId,
			recordId,
			{
				altText: details.altText,
				displayDate:
					details.date === undefined
						? undefined
						: edtfToDisplayDate(details.date),
			},
		);
		await context.progress.markApplied(key, digest);
	}
	await applyKeywords(context, recordId, keywords);
};

const describeItems = async (
	context: ApplyContext,
	story: ManifestStory,
	recordIdsByPath: Map<string, number>,
): Promise<DescribeOutcome> => {
	const outcome: DescribeOutcome = {
		described: 0,
		failed: [],
		finished: true,
	};
	const reachedEnd = await runInOrder(story.items, async (item) => {
		const recordId = recordIdsByPath.get(item.path);
		if (recordId === undefined) {
			return true;
		}
		if (!timeLeft(context)) {
			return false;
		}
		try {
			await applyItemMetadata(context, recordId, item);
			outcome.described += 1;
		} catch (error) {
			outcome.failed.push({ path: item.path, error: describe(error) });
		}
		return true;
	});
	outcome.finished = reachedEnd && outcome.failed.length === 0;
	return outcome;
};

const DATE_ORDER = "display_date_asc";

const isPresented = (
	contents: FolderContents,
	description: string | undefined,
): boolean =>
	contents.sort === DATE_ORDER &&
	((description ?? "").trim() === "" ||
		(contents.description ?? "").trim() !== "");

const presentFolder = async (
	context: ApplyContext,
	folder: FolderSummary,
	description: string | undefined,
	coverRecordId: number | undefined,
): Promise<void> => {
	const read = async (): Promise<FolderContents> =>
		await getFolderContents(context.client, context.archiveId, folder.folderId);
	const before = await read();
	const coverArchiveNbr =
		coverRecordId === undefined
			? undefined
			: before.records.find((record) => record.recordId === coverRecordId)
					?.archiveNbr;
	const settings = { description, coverArchiveNbr };
	const key = `folder:${folder.folderId}`;
	const digest = digestOf(settings);
	if (
		(await context.progress.isApplied(key, digest)) &&
		isPresented(before, description)
	) {
		return;
	}
	await updateFolder(context.client, context.archive, {
		folderId: folder.folderId,
		folderLinkId: folder.folderLinkId,
		archiveNbr: folder.archiveNbr,
		...settings,
		sortByDate: true,
	});
	if (!isPresented(await read(), description)) {
		throw new Error(
			`Permanent didn't keep the narrative or date order for "${folder.name}"`,
		);
	}
	await context.progress.markApplied(key, digest);
};

const rememberFolder = async (
	context: ApplyContext,
	owner: { permanentFolderId?: number | undefined },
	folderId: number,
): Promise<void> => {
	if (owner.permanentFolderId === folderId) {
		return;
	}
	Object.assign(owner, { permanentFolderId: folderId });
	await writeManifest(context.manifestPath, context.manifest);
};

interface StoryInFolder {
	folder: FolderSummary;
	story: ManifestStory;
	recordIdsByPath: Map<string, number>;
}

const tryPresentStory = async (
	context: ApplyContext,
	{ folder, story, recordIdsByPath }: StoryInFolder,
	report: StoryReport,
): Promise<boolean> => {
	const coverRecordId =
		story.cover === undefined ? undefined : recordIdsByPath.get(story.cover);
	try {
		await presentFolder(context, folder, story.description, coverRecordId);
		return true;
	} catch (error) {
		report.failed.push({ path: story.title, error: describe(error) });
		return false;
	}
};

const applyStory = async (
	context: ApplyContext,
	eventFolderId: number,
	story: ManifestStory,
): Promise<{ report: StoryReport; finished: boolean }> => {
	const eventFolder = await getFolderContents(
		context.client,
		context.archiveId,
		eventFolderId,
	);
	const folder = await resolveFolder(
		context,
		eventFolder,
		story.title,
		story.permanentFolderId,
	);
	await rememberFolder(context, story, folder.folderId);
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
	const described = await describeItems(context, story, recordIdsByPath);
	const report: StoryReport = {
		title: story.title,
		folderId: folder.folderId,
		items: story.items.length,
		onPermanent: recordIdsByPath.size,
		described: described.described,
		conflicts: upload.conflicts,
		failed: [...upload.failed, ...described.failed],
		recordIds: [...recordIdsByPath.values()],
	};
	const uploadsSettled = upload.remaining.length === 0;
	report.presented =
		uploadsSettled &&
		timeLeft(context) &&
		(await tryPresentStory(
			context,
			{ folder, story, recordIdsByPath },
			report,
		));
	const mismatches =
		report.presented && described.finished
			? await checkStoryOnPermanent({
					client: context.client,
					progress: context.progress,
					archiveId: context.archiveId,
					ledger: context.ledger,
					folderId: folder.folderId,
					story,
					recordIdsByPath,
				})
			: [];
	if (mismatches.length > 0) {
		report.mismatches = mismatches;
	}
	const finished =
		mismatches.length === 0 &&
		report.presented &&
		upload.failed.length === 0 &&
		described.finished &&
		timeLeft(context);
	return { report, finished };
};

export const applyStoryManifest = async (
	request: ApplyRequest,
): Promise<ApplyReport> => {
	const manifest = await readManifest(request.manifestPath);
	const archive = await findArchive(request.client, request.archiveId);
	const context: ApplyContext = { ...request, archive, manifest };
	const parent = await getFolderContents(
		request.client,
		request.archiveId,
		request.parentFolderId,
	);
	if (isPublicKind(parent.kind) && !request.allowPublic) {
		throw new Error(
			`"${parent.name}" is public: anything put there is visible to everyone. Use a folder in My Files instead, or ask the member before passing allowPublic.`,
		);
	}
	const eventFolder = await resolveFolder(
		context,
		parent,
		manifest.event.title,
		manifest.event.permanentFolderId,
	);
	await rememberFolder(context, manifest.event, eventFolder.folderId);
	const stories: StoryReport[] = [];
	const unfinished: string[] = [];
	const reachedEnd = await runInOrder(manifest.stories, async (story) => {
		if (!timeLeft(context)) {
			return false;
		}
		const { report, finished } = await applyStory(
			context,
			eventFolder.folderId,
			story,
		);
		stories.push(report);
		if (!finished) {
			unfinished.push(story.title);
		}
		return true;
	});
	if (!reachedEnd || unfinished.length > 0) {
		return { done: false, eventFolderId: eventFolder.folderId, stories };
	}
	try {
		await presentFolder(
			context,
			eventFolder,
			manifest.event.description,
			undefined,
		);
	} catch (error) {
		return {
			done: false,
			eventFolderId: eventFolder.folderId,
			eventProblem: describe(error),
			stories,
		};
	}
	return { done: true, eventFolderId: eventFolder.folderId, stories };
};
