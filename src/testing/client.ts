import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../server.ts";
import type { ServerDependencies } from "../server.ts";

export interface ToolOutcome {
	isError: boolean;
	text: string;
	json: () => unknown;
}

export const connectClient = async (
	dependencies?: ServerDependencies,
): Promise<Client> => {
	const [clientTransport, serverTransport] =
		InMemoryTransport.createLinkedPair();
	await createServer(dependencies).connect(serverTransport);
	const client = new Client({ name: "test", version: "0.0.0" });
	await client.connect(clientTransport);
	return client;
};

export const callTool = async (
	client: Client,
	name: string,
	toolArguments: Record<string, unknown>,
): Promise<ToolOutcome> => {
	const result = CallToolResultSchema.parse(
		await client.callTool({ name, arguments: toolArguments }),
	);
	const text = result.content
		.map((block) => (block.type === "text" ? block.text : ""))
		.join("");
	return {
		isError: result.isError === true,
		text,
		json: (): unknown => JSON.parse(text),
	};
};
