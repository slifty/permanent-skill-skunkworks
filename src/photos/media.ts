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
