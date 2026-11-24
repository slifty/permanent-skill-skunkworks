import { describe, expect, it } from "vitest";
import { connectClient } from "./testing/client.ts";

describe("createServer", () => {
	it("identifies itself to an MCP client", async () => {
		const client = await connectClient();

		expect(client.getServerVersion()?.name).toBe("permanent");
	});
});
