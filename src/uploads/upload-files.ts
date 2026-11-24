import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { mapWithConcurrency } from "../concurrency.ts";
import { PermanentApiError } from "../permanent/api.ts";
import { getFolderContents, isPublicKind } from "../permanent/folders.ts";
import { uploadRecord } from "../permanent/upload.ts";
import { getContentType } from "../photos/media.ts";
import type { PermanentClient } from "../permanent/api.ts";
import type { UploadLedger } from "./ledger.ts";

const HASH_CONCURRENCY = 4;
const UPLOAD_CONCURRENCY = 3;
const DUPLICATE_NAME = "already exists in this location";

export interface UploadRequest {
	client: PermanentClient;
	ledger: UploadLedger;
	archiveId: number;
	folderId: number;
	paths: string[];
	deadline: number;
	allowPublic: boolean;
	now?: () => number;
}

export interface UploadReport {
	uploaded: Array<{
		path: string;
		recordId: number;
		fileName: string;
		warning?: string;
	}>;
	alreadyUploaded: Array<{ path: string; recordId: number }>;
	conflicts: Array<{ path: string; fileName: string }>;
	duplicates: Array<{ path: string; sameAs: string }>;
	failed: Array<{ path: string; error: string }>;
	remaining: string[];
}

interface PreparedFile {
	path: string;
	sha256: string;
	size: number;
	modifiedMs: number;
	fileName: string;
}

const hashFile = async (path: string): Promise<string> => {
	const hash = createHash("sha256");
	await pipeline(createReadStream(path), hash);
	return hash.digest("hex");
};

const describe = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const withSuffix = (fileName: string, copy: number): string => {
	const extension = extname(fileName);
	return `${fileName.slice(0, fileName.length - extension.length)} (${copy})${extension}`;
};

const emptyReport = (): UploadReport => ({
	uploaded: [],
	alreadyUploaded: [],
	conflicts: [],
	duplicates: [],
	failed: [],
	remaining: [],
});

class NameAllocator {
	private readonly onPermanent: Set<string>;
	private readonly claimed = new Set<string>();

	public constructor(existing: Array<string | undefined>) {
		this.onPermanent = new Set(
			existing
				.filter((name) => name !== undefined)
				.map((name) => name.toLowerCase()),
		);
	}

	public takenOnPermanent(fileName: string): boolean {
		return this.onPermanent.has(fileName.toLowerCase());
	}

	public claim(fileName: string): string {
		let candidate = fileName;
		let copy = 1;
		while (
			this.claimed.has(candidate.toLowerCase()) ||
			(copy > 1 && this.takenOnPermanent(candidate))
		) {
			copy += 1;
			candidate = withSuffix(fileName, copy);
		}
		this.claimed.add(candidate.toLowerCase());
		return candidate;
	}
}

const prepare = async (
	request: UploadRequest,
	report: UploadReport,
	names: NameAllocator,
): Promise<PreparedFile[]> => {
	const hashed = await mapWithConcurrency(
		request.paths,
		HASH_CONCURRENCY,
		async (path) => {
			try {
				const stats = await stat(path);
				if (!stats.isFile()) {
					return { path, error: "Not a file" };
				}
				return {
					path,
					size: stats.size,
					modifiedMs: stats.mtimeMs,
					sha256: await hashFile(path),
				};
			} catch (error) {
				return { path, error: describe(error) };
			}
		},
	);
	const uploadedBefore = await request.ledger.forFolder(request.folderId);
	const prepared: PreparedFile[] = [];
	const inThisBatch = new Map<string, string>();
	for (const item of hashed) {
		if ("error" in item) {
			report.failed.push({ path: item.path, error: item.error });
			continue;
		}
		const sameAs = inThisBatch.get(item.sha256);
		if (sameAs !== undefined) {
			report.duplicates.push({ path: item.path, sameAs });
			continue;
		}
		inThisBatch.set(item.sha256, item.path);
		const known = uploadedBefore.get(item.sha256);
		if (known !== undefined) {
			report.alreadyUploaded.push({
				path: item.path,
				recordId: known.recordId,
			});
			continue;
		}
		const original = basename(item.path);
		if (names.takenOnPermanent(original)) {
			report.conflicts.push({ path: item.path, fileName: original });
			continue;
		}
		prepared.push({ ...item, fileName: names.claim(original) });
	}
	return prepared;
};

const CHANGED_WHILE_UPLOADING =
	"The file changed while it was being uploaded. Try again once it has stopped changing.";
const NOT_REMEMBERED =
	"Uploaded, but this computer couldn't record it, so uploading it to this folder again would make a copy.";

const isUnchanged = async (file: PreparedFile): Promise<boolean> => {
	const now = await stat(file.path).catch(() => undefined);
	return now?.size === file.size && now.mtimeMs === file.modifiedMs;
};

const recordUpload = async (
	request: UploadRequest,
	file: PreparedFile,
	recordId: number,
): Promise<string | undefined> => {
	try {
		await request.ledger.add({
			folderId: request.folderId,
			sha256: file.sha256,
			recordId,
			path: file.path,
			fileName: file.fileName,
			uploadedAt: new Date().toISOString(),
		});
		return undefined;
	} catch (error) {
		return `${NOT_REMEMBERED} (${describe(error)})`;
	}
};

const sendFile = async (
	request: UploadRequest,
	report: UploadReport,
	file: PreparedFile,
): Promise<number | undefined> => {
	try {
		const { recordId } = await uploadRecord(request.client, {
			path: file.path,
			parentFolderId: request.folderId,
			uploadFileName: file.fileName,
			contentType: getContentType(file.path),
			size: file.size,
		});
		return recordId;
	} catch (error) {
		if (
			error instanceof PermanentApiError &&
			error.message.includes(DUPLICATE_NAME)
		) {
			report.conflicts.push({ path: file.path, fileName: file.fileName });
		} else {
			report.failed.push({ path: file.path, error: describe(error) });
		}
		return undefined;
	}
};

const uploadOne = async (
	request: UploadRequest,
	report: UploadReport,
	file: PreparedFile,
): Promise<void> => {
	const now = request.now ?? Date.now;
	if (now() >= request.deadline) {
		report.remaining.push(file.path);
		return;
	}
	if (!(await isUnchanged(file))) {
		report.failed.push({ path: file.path, error: CHANGED_WHILE_UPLOADING });
		return;
	}
	const recordId = await sendFile(request, report, file);
	if (recordId === undefined) {
		return;
	}
	const changed = !(await isUnchanged(file));
	const warning = changed
		? CHANGED_WHILE_UPLOADING
		: await recordUpload(request, file, recordId);
	report.uploaded.push({
		path: file.path,
		recordId,
		fileName: file.fileName,
		...(warning === undefined ? {} : { warning }),
	});
};

export const uploadFiles = async (
	request: UploadRequest,
): Promise<UploadReport> =>
	await request.ledger.exclusively(
		request.folderId,
		async () => await uploadToFolder(request),
	);

const uploadToFolder = async (
	request: UploadRequest,
): Promise<UploadReport> => {
	const folder = await getFolderContents(
		request.client,
		request.archiveId,
		request.folderId,
	);
	if (isPublicKind(folder.kind) && !request.allowPublic) {
		throw new Error(
			`"${folder.name}" is public: anything uploaded there is visible to everyone. Upload to a folder in My Files instead, or ask the member before passing allowPublic.`,
		);
	}
	const report = emptyReport();
	const names = new NameAllocator(
		folder.records.map((record) => record.fileName),
	);
	const prepared = await prepare(request, report, names);
	await mapWithConcurrency(prepared, UPLOAD_CONCURRENCY, async (file) => {
		await uploadOne(request, report, file);
	});
	return report;
};
