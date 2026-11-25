import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import type { PermanentClient } from "./api.ts";

const BYTES_PER_MEGABYTE = 1_000_000;
const MAX_DOWNLOAD_MEGABYTES = 100;
export const MAX_DOWNLOAD_BYTES = MAX_DOWNLOAD_MEGABYTES * BYTES_PER_MEGABYTE;
const DOWNLOAD_TIMEOUT_MILLISECONDS = 120_000;
const OWNER_ONLY = 0o600;
const SUFFIX_BYTES = 6;
const ORIGINAL = "file.format.original";

const stelaFile = z.looseObject({
	format: z.string(),
	size: z.coerce.number().nullish(),
	fileUrl: z.string(),
});

const stelaRecord = z.looseObject({
	recordId: z.coerce.number(),
	uploadFileName: z.string().nullish(),
	displayName: z.string().nullish(),
	files: z.array(stelaFile).default([]),
});

export interface DownloadedFile {
	path: string;
	fileName: string;
	size: number;
	contentType: string;
}

const tooLarge = (): Error =>
	new Error(
		`The original is larger than ${MAX_DOWNLOAD_MEGABYTES} MB, too large to download here`,
	);

const findOriginal = async (
	client: PermanentClient,
	recordId: number,
): Promise<{
	record: z.infer<typeof stelaRecord>;
	file: z.infer<typeof stelaFile>;
}> => {
	const response = await client.stela({
		path: "/records",
		query: { recordIds: [recordId], pageSize: 1 },
		schema: z.union([
			z.array(stelaRecord),
			z.object({ items: z.array(stelaRecord) }),
		]),
	});
	const [record] = Array.isArray(response) ? response : response.items;
	const file = record?.files.find((candidate) => candidate.format === ORIGINAL);
	if (record === undefined || file === undefined) {
		throw new Error(`Permanent has no original file for record ${recordId}`);
	}
	if ((file.size ?? 0) > MAX_DOWNLOAD_BYTES) {
		throw tooLarge();
	}
	return { record, file };
};

const readCapped = async (response: Response): Promise<Buffer> => {
	if (
		Number(response.headers.get("content-length") ?? 0) > MAX_DOWNLOAD_BYTES
	) {
		throw tooLarge();
	}
	let received = 0;
	const cap = new TransformStream<Uint8Array, Uint8Array>({
		transform: (chunk, controller) => {
			received += chunk.byteLength;
			if (received > MAX_DOWNLOAD_BYTES) {
				controller.error(tooLarge());
				return;
			}
			controller.enqueue(chunk);
		},
	});
	return Buffer.from(
		await new Response(response.body?.pipeThrough(cap)).arrayBuffer(),
	);
};

const safeFileName = (recordId: number, name: string): string =>
	`${recordId}-${basename(name).replace(/[^\p{L}\p{N}._ \-]/gv, "_")}`;

const saveOwnerOnly = async (path: string, bytes: Buffer): Promise<void> => {
	const temporary = `${path}.${randomBytes(SUFFIX_BYTES).toString("hex")}.tmp`;
	try {
		await writeFile(temporary, bytes, { mode: OWNER_ONLY });
		await rename(temporary, path);
	} catch (error) {
		await rm(temporary, { force: true });
		throw error;
	}
};

export const downloadOriginal = async (
	client: PermanentClient,
	recordId: number,
	directory: string,
): Promise<DownloadedFile> => {
	const { record, file } = await findOriginal(client, recordId);
	const response = await fetch(file.fileUrl, {
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MILLISECONDS),
	});
	if (!response.ok) {
		throw new Error(`Permanent's file store returned ${response.status}`);
	}
	const bytes = await readCapped(response);
	const fileName =
		record.uploadFileName ?? record.displayName ?? `record-${recordId}`;
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const path = join(directory, safeFileName(recordId, fileName));
	await saveOwnerOnly(path, bytes);
	return {
		path,
		fileName,
		size: bytes.length,
		contentType:
			(response.headers.get("content-type") ?? "").split(";")[0] ??
			"application/octet-stream",
	};
};
