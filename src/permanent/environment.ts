import { createHash } from "node:crypto";

export interface PermanentEnvironment {
	name: string;
	apiUrl: string;
	stelaUrl: string;
	webUrl: string;
}

const ENVIRONMENTS: Record<string, PermanentEnvironment> = {
	production: {
		name: "production",
		apiUrl: "https://app.permanent.org/api",
		stelaUrl: "https://api.permanent.org/api/v2",
		webUrl: "https://app.permanent.org",
	},
	staging: {
		name: "staging",
		apiUrl: "https://app.staging.permanent.org/api",
		stelaUrl: "https://api.staging.permanent.org/api/v2",
		webUrl: "https://app.staging.permanent.org",
	},
	dev: {
		name: "dev",
		apiUrl: "https://app.dev.permanent.org/api",
		stelaUrl: "https://api.dev.permanent.org/api/v2",
		webUrl: "https://app.dev.permanent.org",
	},
	local: {
		name: "local",
		apiUrl: "https://local.permanent.org/api",
		stelaUrl: "https://local.permanent.org/api/v2",
		webUrl: "https://local.permanent.org",
	},
};

export interface EnvironmentSettings {
	PERMANENT_ENVIRONMENT?: string | undefined;
	PERMANENT_API_URL?: string | undefined;
	PERMANENT_WEB_URL?: string | undefined;
	PERMANENT_STELA_URL?: string | undefined;
}

const isSet = (value: string | undefined): value is string =>
	value !== undefined && value.trim() !== "" && !value.trim().startsWith("${");

const DEFAULT_ENVIRONMENT = "production";

export const resolveEnvironment = (
	name: string | undefined,
): PermanentEnvironment => {
	const key = isSet(name) ? name.trim().toLowerCase() : DEFAULT_ENVIRONMENT;
	const { [key]: environment } = ENVIRONMENTS;
	if (environment === undefined) {
		throw new Error(
			`Unknown Permanent environment "${key}". Use one of: ${Object.keys(ENVIRONMENTS).join(", ")}.`,
		);
	}
	return environment;
};

const CUSTOM_ID_LENGTH = 12;

const withoutTrailingSlash = (url: string): string =>
	url.trim().replace(/\/+$/v, "");

const webUrlFor = (apiUrl: string): string => apiUrl.replace(/\/api$/v, "");

export const environmentFromSettings = (
	settings: EnvironmentSettings,
): PermanentEnvironment => {
	const {
		PERMANENT_API_URL: rawApiUrl,
		PERMANENT_WEB_URL: rawWebUrl,
		PERMANENT_STELA_URL: rawStelaUrl,
	} = settings;
	if (!isSet(rawApiUrl)) {
		return resolveEnvironment(settings.PERMANENT_ENVIRONMENT);
	}
	const apiUrl = withoutTrailingSlash(rawApiUrl);
	const id = createHash("sha256")
		.update(apiUrl)
		.digest("hex")
		.slice(0, CUSTOM_ID_LENGTH);
	return {
		name: `custom-${id}`,
		apiUrl,
		stelaUrl: isSet(rawStelaUrl)
			? withoutTrailingSlash(rawStelaUrl)
			: `${apiUrl}/v2`,
		webUrl: isSet(rawWebUrl)
			? withoutTrailingSlash(rawWebUrl)
			: webUrlFor(apiUrl),
	};
};

export const PRODUCTION = "production";

export const environmentNote = (name: string): string | undefined =>
	name === PRODUCTION
		? undefined
		: `This is Permanent's "${name}" environment, not the live permanent.org. Photos here aren't in the member's real archive, and most people can't open links to it.`;
