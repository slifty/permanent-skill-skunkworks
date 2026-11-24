import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { mapWithConcurrency } from "../concurrency.ts";
import { readPhotoMetadata } from "./exif.ts";
import { getMediaKind } from "./media.ts";
import type { PhotoMetadata } from "./exif.ts";
import type { MediaKind } from "./media.ts";

export interface ScannedItem extends PhotoMetadata {
	path: string;
	kind: MediaKind;
	bytes: number;
	sha256: string;
	takenAt: string;
	takenAtSource: "exif" | "file";
	duplicateOf?: string;
}

export interface SuggestedGroup {
	start: string;
	end: string;
	paths: string[];
}

export interface ScanResult {
	items: ScannedItem[];
	groups: SuggestedGroup[];
	duplicates: number;
	unsupported: string[];
	missing: string[];
	unreadable: string[];
}

interface FoundFiles {
	media: string[];
	unsupported: string[];
	missing: string[];
	unreadable: string[];
}

const MILLISECONDS_PER_MINUTE = 60_000;
const SCAN_CONCURRENCY = 8;
const ZONED_ISO_DATE = /(?:Z|[+\-]\d{2}:\d{2})$/v;

const emptyFound = (): FoundFiles => ({
	media: [],
	unsupported: [],
	missing: [],
	unreadable: [],
});

const mergeFound = (results: FoundFiles[]): FoundFiles => ({
	media: results.flatMap((result) => result.media),
	unsupported: results.flatMap((result) => result.unsupported),
	missing: results.flatMap((result) => result.missing),
	unreadable: results.flatMap((result) => result.unreadable),
});

const hashStream = async (path: string): Promise<string> => {
	const hash = createHash("sha256");
	await pipeline(createReadStream(path), hash);
	return hash.digest("hex");
};

const hashBuffer = (contents: Buffer): string =>
	createHash("sha256").update(contents).digest("hex");

const readImage = async (
	path: string,
): Promise<{ sha256: string; metadata: PhotoMetadata }> => {
	const contents = await readFile(path);
	return {
		sha256: hashBuffer(contents),
		metadata: await readPhotoMetadata(contents),
	};
};

const readVideo = async (
	path: string,
): Promise<{ sha256: string; metadata: PhotoMetadata }> => ({
	sha256: await hashStream(path),
	metadata: {},
});

const classifyFile = (path: string): FoundFiles =>
	getMediaKind(path) === undefined
		? { ...emptyFound(), unsupported: [path] }
		: { ...emptyFound(), media: [path] };

const findInDirectory = async (
	directory: string,
	recursive: boolean,
): Promise<FoundFiles> => {
	const entries = await readdir(directory, { withFileTypes: true }).catch(
		() => undefined,
	);
	if (entries === undefined) {
		return { ...emptyFound(), unreadable: [directory] };
	}
	const visible = entries.filter((entry) => !entry.name.startsWith("."));
	const results = await Promise.all(
		visible.map(async (entry): Promise<FoundFiles> => {
			const entryPath = join(directory, entry.name);
			if (entry.isDirectory()) {
				return recursive
					? await findInDirectory(entryPath, recursive)
					: emptyFound();
			}
			return entry.isFile() ? classifyFile(entryPath) : emptyFound();
		}),
	);
	return mergeFound(results);
};

const findFiles = async (
	rawPath: string,
	recursive: boolean,
): Promise<FoundFiles> => {
	const path = resolve(rawPath);
	const stats = await stat(path).catch(() => undefined);
	if (stats === undefined) {
		return { ...emptyFound(), missing: [path] };
	}
	return stats.isDirectory()
		? await findInDirectory(path, recursive)
		: classifyFile(path);
};

const scanFile = async (path: string): Promise<ScannedItem> => {
	const kind = getMediaKind(path) ?? "image";
	const [stats, { sha256, metadata }] = await Promise.all([
		stat(path),
		kind === "image" ? readImage(path) : readVideo(path),
	]);
	return {
		path,
		kind,
		bytes: stats.size,
		sha256,
		...metadata,
		takenAt: metadata.takenAt ?? stats.mtime.toISOString(),
		takenAtSource: metadata.takenAt === undefined ? "file" : "exif",
	};
};

const toTimestamp = (isoDate: string): number =>
	Date.parse(ZONED_ISO_DATE.test(isoDate) ? isoDate : `${isoDate}Z`);

export const compareByTakenAt = (a: ScannedItem, b: ScannedItem): number => {
	const difference = toTimestamp(a.takenAt) - toTimestamp(b.takenAt);
	return difference === 0 ? a.path.localeCompare(b.path) : difference;
};

export const markDuplicates = (items: ScannedItem[]): number => {
	const firstByHash = new Map<string, string>();
	for (const item of items) {
		const original = firstByHash.get(item.sha256);
		if (original === undefined) {
			firstByHash.set(item.sha256, item.path);
		} else {
			item.duplicateOf = original;
		}
	}
	return items.filter((item) => item.duplicateOf !== undefined).length;
};

export const suggestGroups = (
	sortedItems: ScannedItem[],
	gapMinutes: number,
): SuggestedGroup[] => {
	const gap = gapMinutes * MILLISECONDS_PER_MINUTE;
	const groups: SuggestedGroup[] = [];
	let current: SuggestedGroup | undefined = undefined;
	let previousTimestamp = 0;
	for (const { duplicateOf, takenAt, path } of sortedItems) {
		if (duplicateOf !== undefined) {
			continue;
		}
		const timestamp = toTimestamp(takenAt);
		if (current === undefined || timestamp - previousTimestamp >= gap) {
			current = { start: takenAt, end: takenAt, paths: [path] };
			groups.push(current);
		} else {
			current.paths.push(path);
			current.end = takenAt;
		}
		previousTimestamp = timestamp;
	}
	return groups;
};

export const scanMedia = async (
	paths: string[],
	options: { recursive: boolean; gapMinutes: number },
): Promise<ScanResult> => {
	const found = mergeFound(
		await Promise.all(
			paths.map(async (path) => await findFiles(path, options.recursive)),
		),
	);
	const uniqueMedia = [...new Set(found.media)];
	const scanned = await mapWithConcurrency(
		uniqueMedia,
		SCAN_CONCURRENCY,
		async (path) => await scanFile(path).catch(() => path),
	);
	const items = scanned.filter((entry) => typeof entry !== "string");
	items.sort(compareByTakenAt);
	const duplicates = markDuplicates(items);
	return {
		items,
		groups: suggestGroups(items, options.gapMinutes),
		duplicates,
		unsupported: found.unsupported,
		missing: found.missing,
		unreadable: [
			...found.unreadable,
			...scanned.filter((entry) => typeof entry === "string"),
		],
	};
};
