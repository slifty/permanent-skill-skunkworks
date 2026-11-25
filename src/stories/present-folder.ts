import { getFolderContents } from "../permanent/folders.ts";
import { updateFolder } from "../permanent/metadata.ts";
import { digestOf } from "./progress.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type {
	ArchiveSummary,
	FolderContents,
	FolderSummary,
} from "../permanent/folders.ts";
import type { StoryProgress } from "./progress.ts";

export interface PresentContext {
	client: PermanentClient;
	archive: ArchiveSummary;
	archiveId: number;
	progress: StoryProgress;
}

export interface FolderLook {
	description?: string | undefined;
	coverRecordId?: number | undefined;
	date?: { start: string; end: string } | undefined;
}

const DATE_ORDER = "display_date_asc";
const CALENDAR_DAY_LENGTH = 10;

const calendarDay = (value: string | undefined): string =>
	(value ?? "").slice(0, CALENDAR_DAY_LENGTH);

const isPresented = (contents: FolderContents, look: FolderLook): boolean =>
	contents.sort === DATE_ORDER &&
	((look.description ?? "").trim() === "" ||
		(contents.description ?? "").trim() !== "") &&
	(look.date === undefined ||
		(calendarDay(contents.date) === calendarDay(look.date.start) &&
			calendarDay(contents.endDate) === calendarDay(look.date.end)));

export const presentFolder = async (
	context: PresentContext,
	folder: FolderSummary,
	look: FolderLook,
): Promise<void> => {
	const read = async (): Promise<FolderContents> =>
		await getFolderContents(context.client, context.archiveId, folder.folderId);
	const before = await read();
	const coverArchiveNbr =
		look.coverRecordId === undefined
			? undefined
			: before.records.find((record) => record.recordId === look.coverRecordId)
					?.archiveNbr;
	const settings = { description: look.description, coverArchiveNbr };
	const key = `folder:${folder.folderId}`;
	const digest = digestOf(
		look.date === undefined ? settings : { ...settings, date: look.date },
	);
	if (
		(await context.progress.isApplied(key, digest)) &&
		isPresented(before, look)
	) {
		return;
	}
	await updateFolder(context.client, context.archive, {
		folderId: folder.folderId,
		folderLinkId: folder.folderLinkId,
		archiveNbr: folder.archiveNbr,
		...settings,
		displayDate: look.date?.start,
		displayEndDate: look.date?.end,
		sortByDate: true,
	});
	if (!isPresented(await read(), look)) {
		throw new Error(
			`Permanent didn't keep the narrative, date or date order for "${folder.name}"`,
		);
	}
	await context.progress.markApplied(key, digest);
};
