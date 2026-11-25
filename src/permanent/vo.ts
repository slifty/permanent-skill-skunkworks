import { z } from "zod";

const optionalString = z.string().nullish();

export const archiveVo = z.looseObject({
	archiveId: z.number(),
	archiveNbr: z.string(),
	fullName: optionalString,
	accessRole: optionalString,
	type: optionalString,
	status: optionalString,
});

export const recordVo = z.looseObject({
	recordId: z.number(),
	folder_linkId: z.number().nullish(),
	archiveNbr: optionalString,
	displayName: optionalString,
	description: optionalString,
	displayDT: optionalString,
	type: z.string(),
	status: optionalString,
	uploadFileName: optionalString,
});

export const folderVo = z.looseObject({
	folderId: z.number(),
	folder_linkId: z.number(),
	archiveNbr: optionalString,
	displayName: optionalString,
	description: optionalString,
	displayDT: optionalString,
	displayEndDT: optionalString,
	type: z.string(),
	status: optionalString,
	sort: optionalString,
	view: optionalString,
	thumbArchiveNbr: optionalString,
	ChildItemVOs: z.array(z.looseObject({ type: z.string() })).nullish(),
});

export type ArchiveVo = z.infer<typeof archiveVo>;
export type RecordVo = z.infer<typeof recordVo>;
export type FolderVo = z.infer<typeof folderVo>;
