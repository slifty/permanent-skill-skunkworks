import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PublicationStore } from "./publications.ts";

describe("PublicationStore", () => {
	it("remembers and forgets publications", async () => {
		const directory = await mkdtemp(join(tmpdir(), "publications-test-"));
		const store = new PublicationStore(directory, "test");

		await store.set(10, { state: "published", publicFolderId: 20 });
		expect(await new PublicationStore(directory, "test").get(10)).toEqual({
			state: "published",
			publicFolderId: 20,
		});
		await store.remove(10);

		expect(await store.get(10)).toBeUndefined();
	});

	it("refuses to treat an unreadable record as empty", async () => {
		const directory = await mkdtemp(join(tmpdir(), "publications-test-"));
		await writeFile(join(directory, "publications.test.json"), "{oops");

		await expect(
			new PublicationStore(directory, "test").get(10),
		).rejects.toThrow("can't be read");
	});
});
