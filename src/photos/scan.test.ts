import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildJpeg } from "../testing/jpeg.ts";
import { scanMedia } from "./scan.ts";

const exifDate = (time: string): string => `2024:06:01 ${time}`;

describe("scanMedia", () => {
	let root = "";

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "scan-test-"));
		await mkdir(join(root, "dinner"));
		await writeFile(
			join(root, "cake.jpg"),
			buildJpeg({ dateTimeOriginal: exifDate("21:00:00") }),
		);
		await writeFile(
			join(root, "arrival.jpg"),
			buildJpeg({ dateTimeOriginal: exifDate("14:00:00") }),
		);
		await writeFile(
			join(root, "arrival copy.jpg"),
			buildJpeg({ dateTimeOriginal: exifDate("14:00:00") }),
		);
		await writeFile(
			join(root, "dinner", "toast.jpg"),
			buildJpeg({ dateTimeOriginal: exifDate("20:15:00"), model: "Pixel 8" }),
		);
		await writeFile(join(root, "speech.mov"), Buffer.from("video bytes"));
		await writeFile(join(root, "letter.pdf"), Buffer.from("%PDF-1.4 letter"));
		await writeFile(join(root, "notes.txt"), "not media");
		await writeFile(join(root, ".DS_Store"), "hidden");
	});

	it("finds media recursively, sorted by date", async () => {
		const result = await scanMedia([root], {
			recursive: true,
			gapMinutes: 90,
		});

		const exifItems = result.items.filter(
			(item) => item.takenAtSource === "exif",
		);
		expect(exifItems.map((item) => item.path)).toEqual([
			join(root, "arrival copy.jpg"),
			join(root, "arrival.jpg"),
			join(root, "dinner", "toast.jpg"),
			join(root, "cake.jpg"),
		]);
		expect(result.unsupported).toEqual([join(root, "notes.txt")]);
		expect(result.missing).toEqual([]);
	});

	it("marks exact duplicates and leaves them out of groups", async () => {
		const result = await scanMedia([root], {
			recursive: true,
			gapMinutes: 90,
		});

		const duplicate = result.items.find(
			(item) => item.path === join(root, "arrival.jpg"),
		);
		expect(result.duplicates).toBe(1);
		expect(duplicate?.duplicateOf).toBe(join(root, "arrival copy.jpg"));
		expect(result.groups.flatMap((group) => group.paths)).not.toContain(
			join(root, "arrival.jpg"),
		);
	});

	it("suggests a new group after a gap in time", async () => {
		const result = await scanMedia(
			[join(root, "dinner"), join(root, "cake.jpg"), join(root, "arrival.jpg")],
			{
				recursive: false,
				gapMinutes: 90,
			},
		);

		expect(result.groups.map((group) => group.paths.length)).toEqual([1, 2]);
		expect(result.groups[1]).toMatchObject({
			start: "2024-06-01T20:15:00",
			end: "2024-06-01T21:00:00",
		});
	});

	it("starts a new group when the gap is exactly the threshold", async () => {
		const result = await scanMedia(
			[join(root, "dinner"), join(root, "cake.jpg")],
			{ recursive: false, gapMinutes: 45 },
		);

		expect(result.groups.map((group) => group.paths.length)).toEqual([1, 1]);
	});

	it("falls back to the file's modified time without EXIF", async () => {
		const result = await scanMedia([join(root, "speech.mov")], {
			recursive: true,
			gapMinutes: 90,
		});

		expect(result.items[0]).toMatchObject({
			kind: "video",
			takenAtSource: "file",
		});
	});

	it("includes PDF documents", async () => {
		const result = await scanMedia([join(root, "letter.pdf")], {
			recursive: true,
			gapMinutes: 90,
		});

		expect(result.items[0]).toMatchObject({
			kind: "document",
			takenAtSource: "file",
		});
	});

	it("skips sub-folders when not recursive", async () => {
		const result = await scanMedia([root], {
			recursive: false,
			gapMinutes: 90,
		});

		expect(result.items.map((item) => item.path)).not.toContain(
			join(root, "dinner", "toast.jpg"),
		);
	});

	it("reports paths that do not exist", async () => {
		const result = await scanMedia([join(root, "nope")], {
			recursive: true,
			gapMinutes: 90,
		});

		expect(result.missing).toEqual([join(root, "nope")]);
	});

	it("reports unreadable files without failing the scan", async () => {
		const locked = join(root, "locked.jpg");
		await writeFile(locked, buildJpeg());
		await chmod(locked, 0o000);

		const result = await scanMedia([root], {
			recursive: false,
			gapMinutes: 90,
		});

		expect(result.unreadable).toEqual([locked]);
		expect(result.items.length).toBeGreaterThan(0);
	});
});
