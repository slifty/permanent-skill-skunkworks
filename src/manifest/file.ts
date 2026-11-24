import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { storyManifest } from "./schema.ts";
import type { StoryManifest } from "./schema.ts";

const JSON_INDENT = "\t";
const OWNER_ONLY = 0o600;

const requireAbsolute = (path: string): string => {
	if (!isAbsolute(path)) {
		throw new Error(`Use an absolute path, not "${path}"`);
	}
	return path;
};

export const readManifest = async (path: string): Promise<StoryManifest> => {
	const contents = await readFile(requireAbsolute(path), "utf8");
	return storyManifest.parse(JSON.parse(contents));
};

export const writeManifest = async (
	path: string,
	manifest: StoryManifest,
): Promise<string> => {
	const fullPath = requireAbsolute(path);
	const validated = storyManifest.parse(manifest);
	await mkdir(dirname(fullPath), { recursive: true });
	await writeFile(
		fullPath,
		`${JSON.stringify(validated, null, JSON_INDENT)}\n`,
		{ encoding: "utf8", mode: OWNER_ONLY },
	);
	await chmod(fullPath, OWNER_ONLY);
	return fullPath;
};
