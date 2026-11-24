import { describe, expect, it } from "vitest";
import { buildJpeg } from "../testing/jpeg.ts";
import { exifDateToIso, readPhotoMetadata } from "./exif.ts";

describe("exifDateToIso", () => {
	it("converts an EXIF date to a local ISO date", () => {
		expect(exifDateToIso("2024:06:01 18:30:05")).toBe("2024-06-01T18:30:05");
	});

	it("appends a time zone offset when one is known", () => {
		expect(exifDateToIso("2024:06:01 18:30:05", "-05:00")).toBe(
			"2024-06-01T18:30:05-05:00",
		);
	});

	it("rejects malformed dates", () => {
		expect(exifDateToIso("0000:00:00")).toBeUndefined();
	});

	it("rejects impossible dates", () => {
		expect(exifDateToIso("2024:99:99 99:99:99")).toBeUndefined();
	});

	it("ignores a malformed offset", () => {
		expect(exifDateToIso("2024:06:01 18:30:05", "bogus")).toBe(
			"2024-06-01T18:30:05",
		);
	});
});

describe("readPhotoMetadata", () => {
	it("reads date, location and camera", async () => {
		const metadata = await readPhotoMetadata(
			buildJpeg({
				dateTimeOriginal: "2024:06:01 18:30:05",
				offsetTimeOriginal: "+02:00",
				make: "Apple",
				model: "iPhone 15",
				latitude: 48.8566,
				longitude: -2.3522,
			}),
		);

		expect(metadata.takenAt).toBe("2024-06-01T18:30:05+02:00");
		expect(metadata.camera).toBe("Apple iPhone 15");
		expect(metadata.latitude).toBeCloseTo(48.8566, 3);
		expect(metadata.longitude).toBeCloseTo(-2.3522, 3);
	});

	it("does not repeat the make when the model includes it", async () => {
		const metadata = await readPhotoMetadata(
			buildJpeg({ make: "Canon", model: "Canon EOS R6" }),
		);

		expect(metadata.camera).toBe("Canon EOS R6");
	});

	it("returns nothing for files without EXIF", async () => {
		expect(await readPhotoMetadata(Buffer.from("not an image"))).toEqual({});
	});
});
