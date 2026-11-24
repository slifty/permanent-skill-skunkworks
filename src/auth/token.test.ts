import { describe, expect, it } from "vitest";
import { fakeToken } from "../testing/fake-permanent.ts";
import { isTokenUsable, tokenExpiry } from "./token.ts";

describe("tokenExpiry", () => {
	it("reads the expiry from a JWT", () => {
		const expiry = tokenExpiry(fakeToken(3600));

		expect(expiry?.getTime()).toBeGreaterThan(Date.now());
	});

	it("returns nothing for a token that is not a JWT", () => {
		expect(tokenExpiry("opaque")).toBeUndefined();
	});
});

describe("isTokenUsable", () => {
	it("accepts a token with time left", () => {
		expect(isTokenUsable(fakeToken(3600))).toBe(true);
	});

	it("rejects a token about to expire", () => {
		expect(isTokenUsable(fakeToken(30))).toBe(false);
	});
});
