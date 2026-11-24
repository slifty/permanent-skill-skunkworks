import { z } from "zod";
import { archiveVo, folderVo, recordVo } from "./vo.ts";
import type { PermanentClient } from "./api.ts";
import type { FolderVo } from "./vo.ts";

export interface ArchiveSummary {
	archiveId: number;
	archiveNbr: string;
	name: string;
	role?: string | undefined;
	type?: string | undefined;
}

export interface FolderSummary {
	folderId: number;
	folderLinkId: number;
	archiveNbr?: string | undefined;
	name: string;
	kind: string;
	date?: string | undefined;
	description?: string | undefined;
}

export interface RecordSummary {
	recordId: number;
	archiveNbr?: string | undefined;
	name: string;
	fileName?: string | undefined;
	kind: string;
	date?: string | undefined;
	description?: string | undefined;
	status?: string | undefined;
}

export interface FolderContents extends FolderSummary {
	sort?: string | undefined;
	view?: string | undefined;
	folders: FolderSummary[];
	records: RecordSummary[];
}

export const ROOT_KINDS = {
	private: "root.private",
	public: "root.public",
} as const;

const orUndefined = (value: string | null | undefined): string | undefined =>
	value === null || value === "" ? undefined : value;

const stripPrefix = (
	value: string | null | undefined,
	prefix: string,
): string | undefined => {
	const present = orUndefined(value);
	return present?.startsWith(prefix) === true
		? present.slice(prefix.length)
		: present;
};

const summarizeFolder = (vo: FolderVo): FolderSummary => ({
	folderId: vo.folderId,
	folderLinkId: vo.folder_linkId,
	archiveNbr: orUndefined(vo.archiveNbr),
	name: vo.displayName ?? "",
	kind: stripPrefix(vo.type, "type.folder.") ?? vo.type,
	date: orUndefined(vo.displayDT),
	description: orUndefined(vo.description),
});

const summarizeRecord = (vo: z.infer<typeof recordVo>): RecordSummary => ({
	recordId: vo.recordId,
	archiveNbr: orUndefined(vo.archiveNbr),
	name: vo.displayName ?? vo.uploadFileName ?? "",
	fileName: orUndefined(vo.uploadFileName),
	kind: stripPrefix(vo.type, "type.record.") ?? vo.type,
	date: orUndefined(vo.displayDT),
	description: orUndefined(vo.description),
	status: stripPrefix(vo.status, "status."),
});

const summarizeContents = (vo: FolderVo): FolderContents => {
	const children = vo.ChildItemVOs ?? [];
	return {
		...summarizeFolder(vo),
		sort: stripPrefix(vo.sort, "sort."),
		view: stripPrefix(vo.view, "folder.view."),
		folders: children
			.filter((child) => child.type.startsWith("type.folder."))
			.map((child) => summarizeFolder(folderVo.parse(child))),
		records: children
			.filter((child) => child.type.startsWith("type.record."))
			.map((child) => summarizeRecord(recordVo.parse(child))),
	};
};

export const listArchives = async (
	client: PermanentClient,
): Promise<ArchiveSummary[]> => {
	const archives = await client.backEnd({
		path: "/archive/getAllArchives",
		schema: z.array(archiveVo),
	});
	return archives.map((archive) => ({
		archiveId: archive.archiveId,
		archiveNbr: archive.archiveNbr,
		name: archive.fullName ?? archive.archiveNbr,
		role: stripPrefix(archive.accessRole, "access.role."),
		type: stripPrefix(archive.type, "type.archive."),
	}));
};

export const getArchiveRoots = async (
	client: PermanentClient,
	archiveId: number,
): Promise<FolderContents> =>
	summarizeContents(
		await client.backEnd({
			path: "/folder/getRoot",
			query: { archiveId },
			schema: folderVo,
		}),
	);

export const getFolderContents = async (
	client: PermanentClient,
	archiveId: number,
	folderId: number,
): Promise<FolderContents> =>
	summarizeContents(
		await client.backEnd({
			path: "/folder/getWithChildren",
			query: { archiveId, folderId },
			schema: folderVo,
		}),
	);

export const createFolder = async (
	client: PermanentClient,
	parentFolderId: number,
	name: string,
): Promise<FolderSummary> =>
	summarizeFolder(
		await client.backEnd({
			path: "/folder/post",
			method: "POST",
			body: { displayName: name, parentFolderId, failOnDuplicateName: true },
			schema: folderVo,
		}),
	);

const sameName = (a: string, b: string): boolean =>
	a.trim().localeCompare(b.trim(), undefined, { sensitivity: "accent" }) === 0;

export const isPublicKind = (kind: string): boolean =>
	kind === "public" || kind === "root.public";

export const findFolderNamed = (
	parent: FolderContents,
	name: string,
): FolderSummary | undefined =>
	parent.folders.find((folder) => sameName(folder.name, name));

export const findOrCreateFolder = async (
	client: PermanentClient,
	parent: FolderContents,
	name: string,
): Promise<{ created: boolean; folder: FolderSummary }> => {
	const existing = findFolderNamed(parent, name);
	if (existing !== undefined) {
		return { created: false, folder: existing };
	}
	return {
		created: true,
		folder: await createFolder(client, parent.folderId, name),
	};
};

export const findArchive = async (
	client: PermanentClient,
	archiveId: number,
): Promise<ArchiveSummary> => {
	const archive = (await listArchives(client)).find(
		(candidate) => candidate.archiveId === archiveId,
	);
	if (archive === undefined) {
		throw new Error(
			`Archive ${archiveId} is not one of the member's archives. Call list_archives to see them.`,
		);
	}
	return archive;
};
