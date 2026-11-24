import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "./server.ts";

describe("createServer", () => {
	it("identifies itself to an MCP client", async () => {
		const [clientTransport, serverTransport] =
			InMemoryTransport.createLinkedPair();
		await createServer().connect(serverTransport);
		const client = new Client({ name: "test", version: "0.0.0" });
		await client.connect(clientTransport);

		expect(client.getServerVersion()?.name).toBe("permanent");
	});
});
