import { z } from "zod";
import { getArchiveRoots, getFolderContents } from "./folders.ts";
import { inArchive } from "./metadata.ts";
import type { PermanentClient } from "./api.ts";
import type { PermanentEnvironment } from "./environment.ts";
import type {
	ArchiveSummary,
	FolderContents,
	FolderSummary,
} from "./folders.ts";

export type LinkAccess = "anyone_with_link" | "permanent_account";

const ACCESS_RESTRICTIONS: Record<LinkAccess, "account" | "none"> = {
	anyone_with_link: "none",
	permanent_account: "account",
};

const shareLink = z.looseObject({
	id: z.coerce.string(),
	token: z.string(),
	accessRestrictions: z.string(),
	expirationTimestamp: z.string().nullish(),
});

const PUBLISHING_ROLES = new Set(["owner", "manager"]);

export const shareUrl = (
	environment: PermanentEnvironment,
	token: string,
): string => `${environment.webUrl}/share/${token}`;

export const publicFolderUrl = (
	environment: PermanentEnvironment,
	archive: ArchiveSummary,
	folder: FolderSummary,
): string =>
	`${environment.webUrl}/p/archive/${archive.archiveNbr}/${folder.archiveNbr ?? ""}/${folder.folderLinkId}`;

export const findOrCreateShareLink = async (
	client: PermanentClient,
	folderId: number,
	access: LinkAccess,
): Promise<{ created: boolean; token: string }> => {
	const { [access]: restriction } = ACCESS_RESTRICTIONS;
	const { items } = await client.stela({
		path: `/folders/${folderId}/share_links`,
		schema: z.object({ items: z.array(shareLink) }),
	});
	const existing = items.find(
		(link) =>
			link.accessRestrictions === restriction &&
			(link.expirationTimestamp ?? undefined) === undefined,
	);
	if (existing !== undefined) {
		return { created: false, token: existing.token };
	}
	const { data } = await client.stela({
		path: "/share-links",
		method: "POST",
		body: {
			itemId: String(folderId),
			itemType: "folder",
			accessRestrictions: restriction,
		},
		schema: z.object({ data: shareLink }),
	});
	return { created: true, token: data.token };
};

export const findPublicRoot = async (
	client: PermanentClient,
	archiveId: number,
): Promise<FolderContents> => {
	const roots = await getArchiveRoots(client, archiveId);
	const publicRoot = roots.folders.find(
		(folder) => folder.kind === "root.public",
	);
	if (publicRoot === undefined) {
		throw new Error("This archive has no Public folder.");
	}
	return await getFolderContents(client, archiveId, publicRoot.folderId);
};

export const assertCanPublish = (archive: ArchiveSummary): void => {
	if (!PUBLISHING_ROLES.has(archive.role ?? "")) {
		throw new Error(
			`Publishing needs the owner or manager role in "${archive.name}"; the member is ${archive.role ?? "not a member"}.`,
		);
	}
};

export const copyFolderTo = async (
	client: PermanentClient,
	archive: ArchiveSummary,
	folder: FolderSummary,
	destination: FolderSummary,
): Promise<void> => {
	await inArchive(client, archive, async () => {
		await client.legacy("/folder/copy", [
			{
				FolderVO: {
					folderId: folder.folderId,
					folder_linkId: folder.folderLinkId,
					archiveNbr: folder.archiveNbr,
				},
				FolderDestVO: { folder_linkId: destination.folderLinkId },
			},
		]);
	});
};
