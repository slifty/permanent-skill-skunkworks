import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CredentialStore, defaultDataDirectory } from "./auth/credentials.ts";
import { InterimAuth } from "./auth/interim-auth.ts";
import { PermanentClient } from "./permanent/api.ts";
import { environmentFromSettings } from "./permanent/environment.ts";
import { PublicationStore } from "./permanent/publications.ts";
import { StoryProgress } from "./stories/progress.ts";
import { registerAccountTools } from "./tools/account.ts";
import { registerArchiveTools } from "./tools/archive.ts";
import { registerCurationTools } from "./tools/curation.ts";
import { registerDescribeTools } from "./tools/describe.ts";
import { registerProfileTools } from "./tools/profile.ts";
import { registerShareTools } from "./tools/share.ts";
import { registerStoryTools } from "./tools/story.ts";
import { registerUploadTools } from "./tools/upload.ts";
import { UploadLedger } from "./uploads/ledger.ts";
import { SERVER_VERSION, defaultPluginRoot } from "./version.ts";
import type { PermanentEnvironment } from "./permanent/environment.ts";
import type { UploadToolOptions } from "./tools/upload.ts";

const SERVER_NAME = "permanent";

export interface ServerDependencies {
	environment: PermanentEnvironment;
	auth: InterimAuth;
	client: PermanentClient;
	ledger: UploadLedger;
	progress: StoryProgress;
	publications: PublicationStore;
	uploadOptions?: UploadToolOptions;
	applyBudgetMilliseconds?: number;
	publishPollMilliseconds?: number;
	publishWaitMilliseconds?: number;
	pluginRoot?: string;
}

export const defaultDependencies = (): ServerDependencies => {
	const environment = environmentFromSettings(process.env);
	const dataDirectory = defaultDataDirectory();
	const auth = new InterimAuth({
		environment,
		store: new CredentialStore(dataDirectory, environment.name),
	});
	return {
		environment,
		auth,
		client: new PermanentClient(environment, auth),
		ledger: new UploadLedger(dataDirectory, environment.name),
		progress: new StoryProgress(dataDirectory, environment.name),
		publications: new PublicationStore(dataDirectory, environment.name),
	};
};

export const createServer = (
	dependencies: ServerDependencies = defaultDependencies(),
): McpServer => {
	const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
	registerCurationTools(server);
	registerAccountTools(
		server,
		dependencies.auth,
		dependencies.pluginRoot ?? defaultPluginRoot(),
	);
	registerArchiveTools(server, dependencies.client);
	registerUploadTools(
		server,
		dependencies.client,
		dependencies.ledger,
		dependencies.uploadOptions,
	);
	registerStoryTools(server, dependencies);
	registerShareTools(server, dependencies);
	registerDescribeTools(server, dependencies);
	registerProfileTools(server, dependencies.client);
	return server;
};
