import { extname } from "node:path";

export type MediaKind = "image" | "video";

const IMAGE_EXTENSIONS = new Set([
	".jpg",
	".jpeg",
	".png",
	".heic",
	".heif",
	".tif",
	".tiff",
	".webp",
	".gif",
	".avif",
]);

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv"]);

const CONTENT_TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".heic": "image/heic",
	".heif": "image/heif",
	".tif": "image/tiff",
	".tiff": "image/tiff",
	".webp": "image/webp",
	".gif": "image/gif",
	".avif": "image/avif",
	".mp4": "video/mp4",
	".mov": "video/quicktime",
	".m4v": "video/x-m4v",
	".avi": "video/x-msvideo",
	".mkv": "video/x-matroska",
};

export const getContentType = (path: string): string =>
	CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";

export const getMediaKind = (path: string): MediaKind | undefined => {
	const extension = extname(path).toLowerCase();
	if (IMAGE_EXTENSIONS.has(extension)) {
		return "image";
	}
	if (VIDEO_EXTENSIONS.has(extension)) {
		return "video";
	}
	return undefined;
};
