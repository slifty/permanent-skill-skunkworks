import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UnreadableLedgerError, UploadLedger } from "./ledger.ts";

const ENTRY = {
	folderId: 30,
	sha256: "abc",
	recordId: 501,
	path: "/photos/a.jpg",
	fileName: "a.jpg",
	uploadedAt: "2026-11-24T00:00:00.000Z",
};

describe("UploadLedger", () => {
	it("starts empty and remembers uploads", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ledger-test-"));
		const ledger = new UploadLedger(directory, "test");

		expect((await ledger.forFolder(30)).size).toBe(0);
		await ledger.add(ENTRY);

		expect(
			(await new UploadLedger(directory, "test").forFolder(30)).get("abc"),
		).toEqual(ENTRY);
		expect(await readdir(directory)).toEqual(["uploads.test.json"]);
	});

	it("refuses to treat an unreadable ledger as empty", async () => {
		const directory = await mkdtemp(join(tmpdir(), "ledger-test-"));
		await writeFile(join(directory, "uploads.test.json"), '{"entries": [');
		const ledger = new UploadLedger(directory, "test");

		await expect(ledger.forFolder(30)).rejects.toBeInstanceOf(
			UnreadableLedgerError,
		);
		await expect(ledger.add(ENTRY)).rejects.toBeInstanceOf(
			UnreadableLedgerError,
		);
	});
});
