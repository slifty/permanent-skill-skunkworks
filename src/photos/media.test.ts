import { describe, expect, it } from "vitest";
import { getContentType, getMediaKind } from "./media.ts";

describe("getContentType", () => {
	it("sends a transcription as plain text without treating it as media", () => {
		expect(getContentType("/letters/Letter from Rosa.txt")).toBe("text/plain");
		expect(getMediaKind("/letters/Letter from Rosa.txt")).toBeUndefined();
	});
});
