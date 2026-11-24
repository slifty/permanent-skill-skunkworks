export interface PermanentEnvironment {
	name: string;
	apiUrl: string;
	webUrl: string;
}

const ENVIRONMENTS: Record<string, PermanentEnvironment> = {
	production: {
		name: "production",
		apiUrl: "https://app.permanent.org/api",
		webUrl: "https://app.permanent.org",
	},
	staging: {
		name: "staging",
		apiUrl: "https://app.staging.permanent.org/api",
		webUrl: "https://app.staging.permanent.org",
	},
	dev: {
		name: "dev",
		apiUrl: "https://app.dev.permanent.org/api",
		webUrl: "https://app.dev.permanent.org",
	},
};

const DEFAULT_ENVIRONMENT = "production";

export const resolveEnvironment = (
	name: string | undefined,
): PermanentEnvironment => {
	const trimmed = name?.trim() ?? "";
	const isUnset = trimmed === "" || trimmed.startsWith("${");
	const key = isUnset ? DEFAULT_ENVIRONMENT : trimmed.toLowerCase();
	const { [key]: environment } = ENVIRONMENTS;
	if (environment === undefined) {
		throw new Error(
			`Unknown Permanent environment "${key}". Use one of: ${Object.keys(ENVIRONMENTS).join(", ")}.`,
		);
	}
	return environment;
};
