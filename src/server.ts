import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCurationTools } from "./tools/curation.ts";

const SERVER_NAME = "permanent";
const SERVER_VERSION = "0.1.0";

export const createServer = (): McpServer => {
	const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
	registerCurationTools(server);
	return server;
};
