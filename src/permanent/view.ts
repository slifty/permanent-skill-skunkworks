import { z } from "zod";
import type { PermanentClient } from "./api.ts";

const viewableRecord = z.looseObject({
	recordId: z.number(),
	displayName: z.string().nullish(),
	description: z.string().nullish(),
	altText: z.string().nullish(),
	displayDT: z.string().nullish(),
	uploadFileName: z.string().nullish(),
	type: z.string().nullish(),
	thumbURL500: z.string().nullish(),
	thumbURL1000: z.string().nullish(),
	thumbURL2000: z.string().nullish(),
});

const MAX_IMAGE_BYTES = 4_000_000;
const IMAGE_TIMEOUT_MILLISECONDS = 20_000;

export interface RecordView {
	recordId: number;
	fileName?: string | undefined;
	kind?: string | undefined;
	title?: string | undefined;
	description?: string | undefined;
	altText?: string | undefined;
	date?: string | undefined;
	image?: { data: string; mimeType: string } | undefined;
	imageProblem?: string | undefined;
}

const orUndefined = (value: string | null | undefined): string | undefined =>
	value === null || value === undefined || value.trim() === ""
		? undefined
		: value;

const fetchImage = async (
	url: string,
): Promise<{ data: string; mimeType: string }> => {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(IMAGE_TIMEOUT_MILLISECONDS),
	});
	if (!response.ok) {
		throw new Error(`the preview returned ${response.status}`);
	}
	const mimeType =
		(response.headers.get("content-type") ?? "").split(";")[0] ?? "";
	if (!mimeType.startsWith("image/")) {
		throw new Error(
			`the preview isn't an image (${mimeType === "" ? "no type" : mimeType})`,
		);
	}
	const bytes = Buffer.from(await readCapped(response));
	return { data: bytes.toString("base64"), mimeType };
};

const tooLarge = (): Error => new Error("the preview is too large to show");

const readCapped = async (response: Response): Promise<ArrayBuffer> => {
	if (Number(response.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) {
		throw tooLarge();
	}
	let received = 0;
	const cap = new TransformStream<Uint8Array, Uint8Array>({
		transform: (chunk, controller) => {
			received += chunk.byteLength;
			if (received > MAX_IMAGE_BYTES) {
				controller.error(tooLarge());
				return;
			}
			controller.enqueue(chunk);
		},
	});
	return await new Response(response.body?.pipeThrough(cap)).arrayBuffer();
};

const fetchFirstImage = async (
	urls: string[],
	lastError?: unknown,
): Promise<{ data: string; mimeType: string }> => {
	const [url, ...rest] = urls;
	if (url === undefined) {
		throw lastError instanceof Error
			? lastError
			: new Error("no preview could be loaded");
	}
	try {
		return await fetchImage(url);
	} catch (error) {
		return await fetchFirstImage(rest, error);
	}
};

const readRecord = async (
	client: PermanentClient,
	archiveId: number,
	recordId: number,
): Promise<z.infer<typeof viewableRecord>> =>
	await client.backEnd({
		path: "/record/get",
		query: { recordId, archiveId },
		schema: viewableRecord,
	});

const EXTENSION = /\.[\p{L}\p{N}]{1,5}$/v;

const namesWithoutExtensions = (fileName: string): string[] => {
	const shorter = fileName.replace(EXTENSION, "");
	return shorter === fileName
		? [fileName]
		: [fileName, ...namesWithoutExtensions(shorter)];
};

const isFileNameTitle = (
	title: string,
	fileName: string | undefined,
): boolean =>
	fileName !== undefined && namesWithoutExtensions(fileName).includes(title);

const fieldsOf = (record: z.infer<typeof viewableRecord>): RecordView => {
	const fileName = orUndefined(record.uploadFileName);
	const title = orUndefined(record.displayName);
	return {
		recordId: record.recordId,
		fileName,
		kind: orUndefined(record.type)?.replace(/^type\.record\./v, ""),
		title:
			title === undefined || isFileNameTitle(title, fileName)
				? undefined
				: title,
		description: orUndefined(record.description),
		altText: orUndefined(record.altText),
		date: orUndefined(record.displayDT),
	};
};

export const readRecordFields = async (
	client: PermanentClient,
	archiveId: number,
	recordId: number,
): Promise<RecordView> =>
	fieldsOf(await readRecord(client, archiveId, recordId));

export const viewRecord = async (
	client: PermanentClient,
	archiveId: number,
	recordId: number,
): Promise<RecordView> => {
	const record = await readRecord(client, archiveId, recordId);
	const view = fieldsOf(record);
	const previewUrls = [
		record.thumbURL1000,
		record.thumbURL2000,
		record.thumbURL500,
	]
		.map(orUndefined)
		.filter((url) => url !== undefined);
	if (previewUrls.length === 0) {
		return {
			...view,
			imageProblem: "Permanent has no preview for this record yet",
		};
	}
	try {
		return { ...view, image: await fetchFirstImage(previewUrls) };
	} catch (error) {
		return {
			...view,
			imageProblem: `Couldn't load the preview: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
};
