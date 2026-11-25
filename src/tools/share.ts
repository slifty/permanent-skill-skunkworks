import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import {
	findArchive,
	findFolderNamed,
	getFolderContents,
} from "../permanent/folders.ts";
import {
	assertCanPublish,
	copyFolderTo,
	findOrCreateShareLink,
	findPublicRoot,
	publicFolderUrl,
	shareUrl,
} from "../permanent/sharing.ts";
import { KeyedLock } from "../keyed-lock.ts";
import { environmentNote } from "../permanent/environment.ts";
import { jsonResult } from "./result.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type { PermanentEnvironment } from "../permanent/environment.ts";
import type {
	ArchiveSummary,
	FolderContents,
	FolderSummary,
} from "../permanent/folders.ts";
import type {
	Publication,
	PublicationStore,
} from "../permanent/publications.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const id = z.number().int().positive();
const PUBLISH_WAIT_MILLISECONDS = 20_000;
const PUBLISH_POLL_MILLISECONDS = 2000;

export interface ShareToolDependencies {
	client: PermanentClient;
	environment: PermanentEnvironment;
	publications: PublicationStore;
	publishWaitMilliseconds?: number | undefined;
	publishPollMilliseconds?: number | undefined;
}

interface PublicCopyWait {
	client: PermanentClient;
	archiveId: number;
	copying: CopyingPublication;
	deadline: number;
	pollMilliseconds: number;
}

type CopyingPublication = Extract<Publication, { state: "copying" }>;

const COPY_GIVE_UP_MILLISECONDS = 1_800_000;

const findNewCopy = (
	publicRoot: FolderContents,
	copying: CopyingPublication,
): FolderSummary | undefined =>
	findFolderNamed(
		{
			...publicRoot,
			folders: publicRoot.folders.filter(
				(candidate) =>
					!copying.existingPublicFolderIds.includes(candidate.folderId),
			),
		},
		copying.name,
	);

const waitForPublicCopy = async (
	wait: PublicCopyWait,
): Promise<FolderSummary | undefined> => {
	const copy = findNewCopy(
		await findPublicRoot(wait.client, wait.archiveId),
		wait.copying,
	);
	if (
		copy !== undefined ||
		Date.now() + wait.pollMilliseconds > wait.deadline
	) {
		return copy;
	}
	await delay(wait.pollMilliseconds);
	return await waitForPublicCopy(wait);
};

const isAbandoned = (copying: CopyingPublication): boolean =>
	Date.now() - Date.parse(copying.startedAt) > COPY_GIVE_UP_MILLISECONDS;

const STILL_COPYING = {
	published: false,
	stillCopying: true,
	instructions:
		"Permanent is still copying the folder. Call publish_folder again in a minute to get the public link.",
};

const withEnvironment = (
	name: string,
): { environment: string; environmentNote?: string } => {
	const note = environmentNote(name);
	return note === undefined
		? { environment: name }
		: { environment: name, environmentNote: note };
};

export const registerShareTools = (
	server: McpServer,
	{
		client,
		environment,
		publications,
		publishPollMilliseconds,
		publishWaitMilliseconds,
	}: ShareToolDependencies,
): void => {
	const locks = new KeyedLock();

	const earlierPublication = async (
		archive: ArchiveSummary,
		publicRoot: FolderContents,
		folderId: number,
	): Promise<Record<string, unknown> | undefined> => {
		const known = await publications.get(folderId);
		if (known?.state === "published") {
			const copy = publicRoot.folders.find(
				(candidate) => candidate.folderId === known.publicFolderId,
			);
			return copy === undefined
				? undefined
				: {
						alreadyPublic: true,
						url: publicFolderUrl(environment, archive, copy),
					};
		}
		if (known?.state !== "copying" || isAbandoned(known)) {
			return undefined;
		}
		const copy = findNewCopy(publicRoot, known);
		if (copy === undefined) {
			return STILL_COPYING;
		}
		await publications.set(folderId, {
			state: "published",
			publicFolderId: copy.folderId,
		});
		return {
			published: true,
			url: publicFolderUrl(environment, archive, copy),
		};
	};

	const publish = async (
		archiveId: number,
		folderId: number,
	): Promise<Record<string, unknown>> => {
		const archive = await findArchive(client, archiveId);
		assertCanPublish(archive);
		const folder = await getFolderContents(client, archiveId, folderId);
		if (folder.kind.includes("public")) {
			return {
				alreadyPublic: true,
				url: publicFolderUrl(environment, archive, folder),
			};
		}
		const publicRoot = await findPublicRoot(client, archiveId);
		const earlier = await earlierPublication(archive, publicRoot, folderId);
		if (earlier !== undefined) {
			return earlier;
		}
		const copying: CopyingPublication = {
			state: "copying",
			name: folder.name,
			existingPublicFolderIds: publicRoot.folders.map(
				(candidate) => candidate.folderId,
			),
			startedAt: new Date().toISOString(),
		};
		await publications.set(folderId, copying);
		try {
			await copyFolderTo(client, archive, folder, publicRoot);
		} catch (error) {
			await publications.remove(folderId);
			throw error;
		}
		const copy = await waitForPublicCopy({
			client,
			archiveId,
			copying,
			deadline:
				Date.now() + (publishWaitMilliseconds ?? PUBLISH_WAIT_MILLISECONDS),
			pollMilliseconds: publishPollMilliseconds ?? PUBLISH_POLL_MILLISECONDS,
		});
		if (copy === undefined) {
			return STILL_COPYING;
		}
		await publications.set(folderId, {
			state: "published",
			publicFolderId: copy.folderId,
		});
		return {
			published: true,
			url: publicFolderUrl(environment, archive, copy),
		};
	};

	server.registerTool(
		"share_folder",
		{
			title: "Share a Permanent folder",
			description:
				"Get a link to a folder that the member can send to people. The folder stays private; only people with the link can see it. Reuses an existing link with the same access if there is one. Ask the member who should be able to open it before choosing `access`.",
			inputSchema: {
				archiveId: id,
				folderId: id,
				access: z
					.enum(["anyone_with_link", "permanent_account"])
					.describe(
						"anyone_with_link: anyone who has the link can view. permanent_account: they must sign in to Permanent first.",
					),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async ({ archiveId, folderId, access }) => {
			const folder = await getFolderContents(client, archiveId, folderId);
			const { created, token } = await locks.run(
				`share:${folderId}:${access}`,
				async () => await findOrCreateShareLink(client, folderId, access),
			);
			return jsonResult({
				folder: folder.name,
				access,
				created,
				url: shareUrl(environment, token),
				...withEnvironment(environment.name),
			});
		},
	);

	server.registerTool(
		"publish_folder",
		{
			title: "Publish a folder to Permanent's Public space",
			description:
				"Make a public copy of a folder in the archive's Public space, where anyone on the internet can see it and it appears on the archive's public page. Only call this after the member has explicitly agreed to make it public. The public copy does not follow later edits to the original. Needs the owner or manager role.",
			inputSchema: {
				archiveId: id,
				folderId: id,
				memberAgreedToPublish: z
					.literal(true)
					.describe(
						"Set only after the member has explicitly said yes to making this folder public",
					),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async ({ archiveId, folderId }) =>
			jsonResult({
				...(await locks.run(
					`publish:${folderId}`,
					async () => await publish(archiveId, folderId),
				)),
				...withEnvironment(environment.name),
			}),
	);
};
