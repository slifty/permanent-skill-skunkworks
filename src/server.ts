import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CredentialStore, defaultDataDirectory } from "./auth/credentials.ts";
import { InterimAuth } from "./auth/interim-auth.ts";
import { PermanentClient } from "./permanent/api.ts";
import { resolveEnvironment } from "./permanent/environment.ts";
import { registerAccountTools } from "./tools/account.ts";
import { registerArchiveTools } from "./tools/archive.ts";
import { registerCurationTools } from "./tools/curation.ts";

const SERVER_NAME = "permanent";
const SERVER_VERSION = "0.1.0";

export interface ServerDependencies {
	auth: InterimAuth;
	client: PermanentClient;
}

export const defaultDependencies = (): ServerDependencies => {
	const environment = resolveEnvironment(process.env.PERMANENT_ENVIRONMENT);
	const auth = new InterimAuth({
		environment,
		store: new CredentialStore(defaultDataDirectory(), environment.name),
	});
	return { auth, client: new PermanentClient(environment, auth) };
};

export const createServer = (
	dependencies: ServerDependencies = defaultDependencies(),
): McpServer => {
	const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
	registerCurationTools(server);
	registerAccountTools(server, dependencies.auth);
	registerArchiveTools(server, dependencies.client);
	return server;
};
