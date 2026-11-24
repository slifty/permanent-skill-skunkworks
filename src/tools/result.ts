import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const JSON_INDENT = 2;

export const jsonResult = (value: unknown): CallToolResult => ({
	content: [{ type: "text", text: JSON.stringify(value, null, JSON_INDENT) }],
});
