import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isNewer, newestInstalledVersion, updateNote } from "./version.ts";

const installVersion = async (
	cache: string,
	version: string,
	name = "permanent",
): Promise<string> => {
	const root = join(cache, version);
	await mkdir(join(root, ".claude-plugin"), { recursive: true });
	await writeFile(
		join(root, ".claude-plugin", "plugin.json"),
		JSON.stringify({ name, version }),
	);
	return root;
};

describe("isNewer", () => {
	it.each([
		["0.1.10", "0.1.9", true],
		["0.2.0", "0.1.9", true],
		["0.1.6", "0.1.6", false],
		["0.1.5", "0.1.6", false],
	])("%s newer than %s is %s", (candidate, current, expected) => {
		expect(isNewer(candidate, current)).toBe(expected);
	});
});

describe("installed versions", () => {
	it("finds the newest version in Claude's plugin cache", async () => {
		const cache = await mkdtemp(join(tmpdir(), "plugin-cache-"));
		const running = await installVersion(cache, "0.1.2");
		await installVersion(cache, "0.1.0");
		await installVersion(cache, "0.1.10");
		await installVersion(cache, "9.9.9", "something-else");

		expect(await newestInstalledVersion(running)).toBe("0.1.10");
		expect(await updateNote(running, "0.1.2")).toContain("Restart Claude");
	});

	it("says nothing when the running version is the newest", async () => {
		const cache = await mkdtemp(join(tmpdir(), "plugin-cache-"));
		const running = await installVersion(cache, "0.1.6");

		expect(await updateNote(running, "0.1.6")).toBeUndefined();
	});

	it("notices a newer plugin.json in its own folder", async () => {
		const cache = await mkdtemp(join(tmpdir(), "plugin-checkout-"));
		const root = await installVersion(cache, "permanent");
		await writeFile(
			join(root, ".claude-plugin", "plugin.json"),
			JSON.stringify({ name: "permanent", version: "0.2.0" }),
		);

		expect(await updateNote(root, "0.1.6")).toContain("0.2.0");
	});
});
