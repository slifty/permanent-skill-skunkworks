import { describe, expect, it } from "vitest";
import { resolveEnvironment } from "./environment.ts";

describe("resolveEnvironment", () => {
	it("defaults to production", () => {
		expect(resolveEnvironment(undefined).apiUrl).toBe(
			"https://app.permanent.org/api",
		);
		expect(resolveEnvironment("").name).toBe("production");
		const unexpandedSetting = ["$", "{user_config.environment}"].join("");
		expect(resolveEnvironment(unexpandedSetting).name).toBe("production");
	});

	it("accepts known environments in any case", () => {
		expect(resolveEnvironment(" Dev ").apiUrl).toBe(
			"https://app.dev.permanent.org/api",
		);
	});

	it("rejects unknown environments", () => {
		expect(() => resolveEnvironment("moon")).toThrow(
			/Unknown Permanent environment/v,
		);
	});
});
