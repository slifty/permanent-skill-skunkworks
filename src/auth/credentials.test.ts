import { chmod, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CredentialStore } from "./credentials.ts";

const CREDENTIALS = {
	environment: "test",
	accessToken: "token",
	email: "rosa@example.com",
	savedAt: "2026-11-24T00:00:00.000Z",
};

describe("CredentialStore", () => {
	it("treats a corrupt file as signed out", async () => {
		const directory = await mkdtemp(join(tmpdir(), "credentials-test-"));
		await writeFile(join(directory, "credentials.test.json"), "{not json");

		expect(await new CredentialStore(directory, "test").read()).toBeUndefined();
	});

	it("tightens permissions on an existing file when writing", async () => {
		const directory = await mkdtemp(join(tmpdir(), "credentials-test-"));
		const path = join(directory, "credentials.test.json");
		await writeFile(path, "{}");
		await chmod(path, 0o644);
		await chmod(directory, 0o755);

		await new CredentialStore(directory, "test").write(CREDENTIALS);

		expect((await stat(path)).mode & 0o777).toBe(0o600);
		expect((await stat(directory)).mode & 0o777).toBe(0o700);
	});
});
