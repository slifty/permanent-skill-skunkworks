import { describe, expect, it } from "vitest";
import { environmentFromSettings, resolveEnvironment } from "./environment.ts";

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

	it("uses an explicit API address for local testing", () => {
		expect(
			environmentFromSettings({
				PERMANENT_ENVIRONMENT: "production",
				PERMANENT_API_URL: "http://127.0.0.1:9000/api/",
				PERMANENT_WEB_URL: "http://127.0.0.1:9000",
			}),
		).toMatchObject({
			name: expect.stringMatching(/^custom-[0-9a-f]{12}$/v) as unknown,
			apiUrl: "http://127.0.0.1:9000/api",
			webUrl: "http://127.0.0.1:9000",
		});
	});

	it("derives the web address from the API address when not given", () => {
		expect(
			environmentFromSettings({
				PERMANENT_API_URL: "http://127.0.0.1:9000/api/",
			}).webUrl,
		).toBe("http://127.0.0.1:9000");
	});

	it("keeps each custom API's sign-in and records separate", () => {
		const first = environmentFromSettings({
			PERMANENT_API_URL: "http://a.test/api",
		});
		const second = environmentFromSettings({
			PERMANENT_API_URL: "http://b.test/api",
		});
		const again = environmentFromSettings({
			PERMANENT_API_URL: "http://a.test/api/",
		});

		expect(first.name).not.toBe(second.name);
		expect(again.name).toBe(first.name);
	});

	it("ignores an empty API address", () => {
		expect(
			environmentFromSettings({
				PERMANENT_ENVIRONMENT: "dev",
				PERMANENT_API_URL: " ",
			}).name,
		).toBe("dev");
	});

	it("points each named environment at its own stela host", () => {
		expect(resolveEnvironment("production").stelaUrl).toBe(
			"https://api.permanent.org/api/v2",
		);
		expect(resolveEnvironment("dev").stelaUrl).toBe(
			"https://api.dev.permanent.org/api/v2",
		);
	});

	it("uses an explicit stela address for a custom API, or the API's own /v2", () => {
		expect(
			environmentFromSettings({
				PERMANENT_API_URL: "http://127.0.0.1:9000/api",
				PERMANENT_STELA_URL: "http://127.0.0.1:9001/api/v2/",
			}).stelaUrl,
		).toBe("http://127.0.0.1:9001/api/v2");
		expect(
			environmentFromSettings({
				PERMANENT_API_URL: "http://127.0.0.1:9000/api",
			}).stelaUrl,
		).toBe("http://127.0.0.1:9000/api/v2");
	});

	it("rejects unknown environments", () => {
		expect(() => resolveEnvironment("moon")).toThrow(
			/Unknown Permanent environment/v,
		);
	});
});
