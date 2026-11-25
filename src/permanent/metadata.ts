import { z } from "zod";
import type { PermanentClient } from "./api.ts";

export interface ArchiveRef {
	archiveId: number;
	archiveNbr: string;
}

export interface PlaceInput {
	name?: string | undefined;
	latitude?: number | undefined;
	longitude?: number | undefined;
}

export interface RecordDetails {
	title?: string | undefined;
	description?: string | undefined;
	date?: string | undefined;
	location?: PlaceInput | undefined;
}

export interface FolderDetails {
	folderId: number;
	folderLinkId: number;
	archiveNbr?: string | undefined;
	name?: string | undefined;
	description?: string | undefined;
	coverArchiveNbr?: string | undefined;
	sortByDate?: boolean | undefined;
}

export const SORT_BY_DATE = "sort.display_date_asc";

const editableRecord = z.looseObject({
	recordId: z.number(),
	displayName: z.string().nullish(),
	description: z.string().nullish(),
	displayDT: z.string().nullish(),
	displayEndDT: z.string().nullish(),
	publicDT: z.string().nullish(),
	note: z.string().nullish(),
	locnId: z.number().nullish(),
});

const withoutUndefined = (
	value: Record<string, unknown>,
): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	);

export const updateRecordDetails = async (
	client: PermanentClient,
	recordId: number,
	details: RecordDetails,
): Promise<void> => {
	const body = withoutUndefined({
		displayName: details.title,
		description: details.description,
		displayTime: details.date,
		location:
			details.location === undefined
				? undefined
				: withoutUndefined({ ...details.location }),
	});
	if (Object.keys(body).length === 0) {
		return;
	}
	await client.stela({
		path: `/records/${recordId}`,
		method: "PATCH",
		body,
		schema: z.unknown(),
	});
};

export const setRecordAltText = async (
	client: PermanentClient,
	archiveId: number,
	recordId: number,
	altText: string,
): Promise<void> => {
	const current = await client.backEnd({
		path: "/record/get",
		query: { recordId, archiveId },
		schema: editableRecord,
	});
	await client.backEnd({
		path: "/record/update",
		method: "POST",
		body: {
			recordId,
			archiveId,
			displayName: current.displayName,
			description: current.description,
			displayDt: current.displayDT,
			displayEndDt: current.displayEndDT,
			publicDt: current.publicDT,
			note: current.note,
			locnId: current.locnId,
			altText,
		},
		schema: z.unknown(),
	});
};

export const inArchive = async (
	client: PermanentClient,
	archive: ArchiveRef,
	work: () => Promise<void>,
): Promise<void> => {
	await client.withSessionLock(async () => {
		await client.legacy("/archive/change", [
			{
				ArchiveVO: {
					archiveId: archive.archiveId,
					archiveNbr: archive.archiveNbr,
				},
			},
		]);
		await work();
	});
};

export const addRecordKeywords = async (
	client: PermanentClient,
	archive: ArchiveRef,
	recordId: number,
	keywords: string[],
): Promise<void> => {
	if (keywords.length === 0) {
		return;
	}
	await inArchive(client, archive, async () => {
		await client.legacy(
			"/tag/post",
			keywords.map((name) => ({
				TagVO: { name },
				TagLinkVO: { refTable: "record", refId: recordId },
			})),
		);
	});
};

export const updateFolder = async (
	client: PermanentClient,
	archive: ArchiveRef,
	details: FolderDetails,
): Promise<void> => {
	const changes = withoutUndefined({
		displayName: details.name,
		description: details.description,
		thumbArchiveNbr: details.coverArchiveNbr,
	});
	const folder = withoutUndefined({
		folderId: details.folderId,
		archiveNbr: details.archiveNbr,
		folder_linkId: details.folderLinkId,
		displayName: details.name,
		description: details.description,
		thumbArchiveNbr: details.coverArchiveNbr,
	});
	await inArchive(client, archive, async () => {
		if (Object.keys(changes).length > 0) {
			await client.legacy("/folder/update", [{ FolderVO: folder }]);
		}
		if (details.sortByDate === true) {
			await client.legacy("/folder/sort", [
				{
					FolderVO: { folder_linkId: details.folderLinkId, sort: SORT_BY_DATE },
				},
			]);
		}
	});
};
