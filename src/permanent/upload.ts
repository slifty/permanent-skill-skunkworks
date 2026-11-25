import { openAsBlob } from "node:fs";
import { z } from "zod";
import { mapWithConcurrency } from "../concurrency.ts";
import { KeyedLock } from "../keyed-lock.ts";
import { recordVo } from "./vo.ts";
import type { PermanentClient } from "./api.ts";
import type { RecordVo } from "./vo.ts";

export const MULTIPART_PART_BYTES = 10_485_760;
export const MULTIPART_THRESHOLD_BYTES = 104_857_600;
const PART_CONCURRENCY = 3;
const registrations = new KeyedLock();

const presignedUpload = z.object({
	destinationUrl: z.string(),
	presignedPost: z.object({
		url: z.string(),
		fields: z.record(z.string(), z.string()),
	}),
});

const multipartUrls = z.object({
	urls: z.array(z.string()),
	uploadId: z.string(),
	key: z.string(),
});

export class StorageUploadError extends Error {
	public constructor(status: number, body: string) {
		super(`Permanent's file storage rejected the upload (${status}): ${body}`);
	}
}

export interface FileToUpload {
	path: string;
	parentFolderId: number;
	uploadFileName: string;
	contentType: string;
	size: number;
}

interface MultipartData {
	uploadId: string;
	key: string;
	parts: Array<{ PartNumber: number; ETag: string }>;
}

const assertStored = async (response: Response): Promise<void> => {
	if (!response.ok) {
		throw new StorageUploadError(response.status, await response.text());
	}
};

const uploadWithPost = async (
	client: PermanentClient,
	file: FileToUpload,
): Promise<string> => {
	const { destinationUrl, presignedPost } = await client.backEnd({
		path: "/record/getPresignedUrl",
		method: "POST",
		body: {
			displayName: file.uploadFileName,
			parentFolderId: file.parentFolderId,
			uploadFileName: file.uploadFileName,
			fileType: file.contentType,
			size: file.size,
		},
		schema: presignedUpload,
	});
	const form = new FormData();
	for (const [name, value] of Object.entries(presignedPost.fields)) {
		form.append(name, value);
	}
	form.append("Content-Type", file.contentType);
	form.append(
		"file",
		await openAsBlob(file.path, { type: file.contentType }),
		file.uploadFileName,
	);
	await assertStored(
		await fetch(presignedPost.url, { method: "POST", body: form }),
	);
	return destinationUrl;
};

const uploadInParts = async (
	client: PermanentClient,
	file: FileToUpload,
): Promise<MultipartData> => {
	const { urls, uploadId, key } = await client.backEnd({
		path: "/record/getMultipartUploadUrls",
		method: "POST",
		body: { fileSizeInBytes: file.size },
		schema: multipartUrls,
	});
	const blob = await openAsBlob(file.path);
	const parts = await mapWithConcurrency(
		[...urls.entries()],
		PART_CONCURRENCY,
		async ([index, url]) => {
			const start = index * MULTIPART_PART_BYTES;
			const response = await fetch(url, {
				method: "PUT",
				body: blob.slice(start, start + MULTIPART_PART_BYTES),
			});
			await assertStored(response);
			return {
				PartNumber: index + 1,
				ETag: response.headers.get("etag") ?? "",
			};
		},
	);
	return { uploadId, key, parts };
};

export const uploadRecord = async (
	client: PermanentClient,
	file: FileToUpload,
): Promise<RecordVo> => {
	const location =
		file.size > MULTIPART_THRESHOLD_BYTES
			? { multipartUploadData: await uploadInParts(client, file) }
			: { s3url: await uploadWithPost(client, file) };
	return await registrations.run(
		"registerRecord",
		async () =>
			await client.backEnd({
				path: "/record/registerRecord",
				method: "POST",
				body: {
					displayName: file.uploadFileName,
					parentFolderId: file.parentFolderId,
					uploadFileName: file.uploadFileName,
					size: file.size,
					failOnDuplicateName: true,
					...location,
				},
				schema: recordVo,
			}),
	);
};
