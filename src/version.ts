import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const SERVER_VERSION = "0.1.21";

const PLUGIN_NAME = "permanent";
const pluginManifest = z.looseObject({
	name: z.string(),
	version: z.string(),
});

const parseVersion = (version: string): number[] =>
	version.split(".").map((part) => {
		const value = Number.parseInt(part, 10);
		return Number.isNaN(value) ? 0 : value;
	});

export const isNewer = (candidate: string, current: string): boolean => {
	const [a, b] = [parseVersion(candidate), parseVersion(current)];
	const length = Math.max(a.length, b.length);
	for (let index = 0; index < length; index += 1) {
		const difference = (a[index] ?? 0) - (b[index] ?? 0);
		if (difference !== 0) {
			return difference > 0;
		}
	}
	return false;
};

const readPluginVersion = async (
	pluginRoot: string,
): Promise<string | undefined> => {
	try {
		const manifest = pluginManifest.parse(
			JSON.parse(
				await readFile(
					join(pluginRoot, ".claude-plugin", "plugin.json"),
					"utf8",
				),
			),
		);
		return manifest.name === PLUGIN_NAME ? manifest.version : undefined;
	} catch (_error) {
		return undefined;
	}
};

export const newestInstalledVersion = async (
	pluginRoot: string,
): Promise<string | undefined> => {
	const siblings = await readdir(dirname(pluginRoot)).catch(() => []);
	const versions = await Promise.all([
		readPluginVersion(pluginRoot),
		...siblings.map(
			async (name) => await readPluginVersion(join(dirname(pluginRoot), name)),
		),
	]);
	return versions
		.filter((version) => version !== undefined)
		.reduce<string | undefined>(
			(newest, version) =>
				newest === undefined || isNewer(version, newest) ? version : newest,
			undefined,
		);
};

export const defaultPluginRoot = (): string =>
	resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const updateNote = async (
	pluginRoot: string,
	runningVersion = SERVER_VERSION,
): Promise<string | undefined> => {
	const newest = await newestInstalledVersion(pluginRoot);
	return newest !== undefined && isNewer(newest, runningVersion)
		? `The Permanent plugin running now is version ${runningVersion}, but version ${newest} is installed. Restart Claude to use it.`
		: undefined;
};
