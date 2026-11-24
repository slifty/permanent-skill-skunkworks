import { describe, expect, it } from "vitest";
import { isEdtfDateTime, isSupportedEdtf } from "./edtf.ts";

describe("isSupportedEdtf", () => {
	it.each([
		"2024",
		"2024-06",
		"2024-06-01",
		"2024-06-01~",
		"2024?",
		"2024-06%",
		"2024-02-29",
		"0001-01-01",
		"0099-12-31",
		"2024-06-01T18:30:00",
		"2024-06-01T18:30:00Z",
		"2024-06-01T18:30:00-05:00",
		"2024-06-01/2024-06-02",
		"2024-06/..",
		"/2024",
	])("accepts %s", (value) => {
		expect(isSupportedEdtf(value)).toBe(true);
	});

	it.each([
		"",
		"not-a-date",
		"2024-13",
		"2024-00-10",
		"2023-02-29",
		"2024-06-31",
		"2024-06-01T24:00:00",
		"2024-06-01T18:60:00",
		"2024-06-01T18:30",
		"2024-06-01 18:30:00",
		"../..",
		"2024/2025/2026",
		"2024-06-01T18:30:00/2024-06-02",
	])("rejects %s", (value) => {
		expect(isSupportedEdtf(value)).toBe(false);
	});
});

describe("isEdtfDateTime", () => {
	it("rejects a time zone offset out of range", () => {
		expect(isEdtfDateTime("2024-06-01T18:30:00+15:00")).toBe(false);
	});
});
