import { edtfToDisplayDate } from "../dates/edtf.ts";
import { getFolderContents } from "../permanent/folders.ts";
import type { StoryManifest } from "../manifest/schema.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type { FolderContents, RecordSummary } from "../permanent/folders.ts";
import type { UploadLedger } from "../uploads/ledger.ts";
import type { StoryProgress } from "./progress.ts";

type ManifestStory = StoryManifest["stories"][number];
type ManifestItem = ManifestStory["items"][number];

export interface Mismatch {
	path: string;
	field: "title" | "description" | "date" | "missing" | "narrative" | "cover";
	expected: string;
	actual: string;
}

export interface StoryCheck {
	client: PermanentClient;
	progress: StoryProgress;
	ledger: UploadLedger;
	archiveId: number;
	folderId: number;
	story: ManifestStory;
	recordIdsByPath: Map<string, number>;
}

const CALENDAR_DAY_LENGTH = 10;

const sameText = (a: string | undefined, b: string | undefined): boolean =>
	(a ?? "").trim() === (b ?? "").trim();

const calendarDay = (value: string | undefined): string =>
	(value ?? "").slice(0, CALENDAR_DAY_LENGTH);

const missing = (path: string, actual: string): Mismatch => ({
	path,
	field: "missing",
	expected: "on Permanent",
	actual,
});

const textMismatch = (
	path: string,
	field: "title" | "description",
	expected: string | undefined,
	actual: string | undefined,
): Mismatch[] =>
	expected === undefined || sameText(expected, actual)
		? []
		: [{ path, field, expected, actual: actual ?? "" }];

const itemMismatches = (
	item: ManifestItem,
	recordId: number | undefined,
	record: RecordSummary | undefined,
): Mismatch[] => {
	if (recordId === undefined) {
		return [missing(item.path, "not uploaded: see conflicts or duplicates")];
	}
	if (record === undefined) {
		return [missing(item.path, "not found in the story's folder")];
	}
	const expectedDay = calendarDay(
		item.date === undefined ? undefined : edtfToDisplayDate(item.date),
	);
	return [
		...textMismatch(item.path, "title", item.title, record.name),
		...textMismatch(
			item.path,
			"description",
			item.description,
			record.description,
		),
		...(expectedDay === "" || expectedDay === calendarDay(record.date)
			? []
			: [
					{
						path: item.path,
						field: "date" as const,
						expected: expectedDay,
						actual: calendarDay(record.date),
					},
				]),
	];
};

const narrativeMismatch = (
	story: ManifestStory,
	contents: FolderContents,
): Mismatch[] => {
	const narrative = (story.description ?? "").trim();
	return narrative === "" || sameText(narrative, contents.description)
		? []
		: [
				{
					path: story.title,
					field: "narrative",
					expected: narrative,
					actual: contents.description ?? "",
				},
			];
};

const coverMismatch = (
	story: ManifestStory,
	contents: FolderContents,
	recordIdsByPath: Map<string, number>,
): Mismatch[] => {
	if (story.cover === undefined) {
		return [];
	}
	const coverId = recordIdsByPath.get(story.cover);
	const coverRecord = contents.records.find(
		(record) => record.recordId === coverId,
	);
	return coverRecord === undefined ||
		(coverRecord.archiveNbr !== undefined &&
			coverRecord.archiveNbr === contents.coverArchiveNbr)
		? []
		: [
				{
					path: story.title,
					field: "cover",
					expected: story.cover,
					actual: contents.coverArchiveNbr ?? "none",
				},
			];
};

const folderMismatches = (
	story: ManifestStory,
	contents: FolderContents,
	recordIdsByPath: Map<string, number>,
): Mismatch[] => [
	...narrativeMismatch(story, contents),
	...coverMismatch(story, contents, recordIdsByPath),
];

const forgetStale = async (
	check: StoryCheck,
	itemProblems: Mismatch[],
	folderProblems: Mismatch[],
): Promise<void> => {
	const { progress, ledger, folderId, recordIdsByPath } = check;
	const stalePaths = new Set(itemProblems.map((problem) => problem.path));
	await Promise.all([
		...[...stalePaths].map(async (path) => {
			const recordId = recordIdsByPath.get(path);
			if (recordId === undefined) {
				return;
			}
			await progress.markApplied(`record:${recordId}`, "stale");
		}),
		...itemProblems
			.filter((problem) => problem.actual === "not found in the story's folder")
			.map(async (problem) => {
				await ledger.forgetRecord(
					folderId,
					recordIdsByPath.get(problem.path) ?? 0,
				);
			}),
		...(folderProblems.length > 0
			? [progress.markApplied(`folder:${folderId}`, "stale")]
			: []),
	]);
};

export const checkStoryOnPermanent = async (
	check: StoryCheck,
): Promise<Mismatch[]> => {
	const { client, archiveId, folderId, story, recordIdsByPath } = check;
	const contents = await getFolderContents(client, archiveId, folderId);
	const byId = new Map(
		contents.records.map((record) => [record.recordId, record]),
	);
	const itemProblems = story.items.flatMap((item) => {
		const recordId = recordIdsByPath.get(item.path);
		return itemMismatches(
			item,
			recordId,
			recordId === undefined ? undefined : byId.get(recordId),
		);
	});
	const folderProblems = folderMismatches(story, contents, recordIdsByPath);
	await forgetStale(check, itemProblems, folderProblems);
	return [...itemProblems, ...folderProblems];
};
