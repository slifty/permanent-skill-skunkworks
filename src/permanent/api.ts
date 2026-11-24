import { NotSignedInError } from "../auth/interim-auth.ts";
import { LegacyApiError, legacyMessages, postLegacy } from "./legacy-api.ts";
import type { LegacyResponse } from "./legacy-api.ts";
import type { PermanentEnvironment } from "./environment.ts";
import type { z } from "zod";

const HTTP_UNAUTHORIZED = 401;
const ERROR_SNIPPET_LENGTH = 300;

export interface TokenSource {
	getAccessToken: () => Promise<string>;
	signOut: () => Promise<void>;
}

export class PermanentApiError extends Error {
	public readonly status: number;

	public constructor(path: string, status: number, body: string) {
		super(
			`Permanent returned ${status} for ${path}: ${body.slice(0, ERROR_SNIPPET_LENGTH)}`,
		);
		this.status = status;
	}
}

type QueryValue = string | number | boolean | Array<string | number>;

export interface ApiRequest<Schema extends z.ZodType> {
	path: string;
	schema: Schema;
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	query?: Record<string, QueryValue | undefined>;
	body?: unknown;
}

const withQuery = (
	url: string,
	query: Record<string, QueryValue | undefined> = {},
): string => {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (Array.isArray(value)) {
			value.forEach((item) => {
				params.append(`${key}[]`, String(item));
			});
		} else if (value !== undefined) {
			params.set(key, String(value));
		}
	}
	const search = params.toString();
	return search === "" ? url : `${url}?${search}`;
};

export class PermanentClient {
	private readonly environment: PermanentEnvironment;
	private readonly tokens: TokenSource;
	private sessionLock: Promise<unknown> = Promise.resolve();

	public constructor(environment: PermanentEnvironment, tokens: TokenSource) {
		this.environment = environment;
		this.tokens = tokens;
	}

	public async backEnd<Schema extends z.ZodType>(
		request: ApiRequest<Schema>,
	): Promise<z.infer<Schema>> {
		return await this.send(this.environment.apiUrl, request);
	}

	public async withSessionLock<Result>(
		work: () => Promise<Result>,
	): Promise<Result> {
		const result = this.sessionLock.then(work);
		this.sessionLock = result.catch(() => undefined);
		return await result;
	}

	public async legacy(
		endpoint: string,
		data: Array<Record<string, unknown>>,
	): Promise<LegacyResponse> {
		const response = await postLegacy({
			apiUrl: this.environment.apiUrl,
			endpoint,
			data,
			token: await this.tokens.getAccessToken(),
		});
		if (!response.isSuccessful) {
			throw new LegacyApiError(endpoint, legacyMessages(response));
		}
		return response;
	}

	public async stela<Schema extends z.ZodType>(
		request: ApiRequest<Schema>,
	): Promise<z.infer<Schema>> {
		return await this.send(`${this.environment.apiUrl}/v2`, request);
	}

	private async send<Schema extends z.ZodType>(
		baseUrl: string,
		{ path, schema, method = "GET", query, body }: ApiRequest<Schema>,
	): Promise<z.infer<Schema>> {
		const token = await this.tokens.getAccessToken();
		const response = await fetch(withQuery(`${baseUrl}${path}`, query), {
			method,
			headers: {
				Authorization: `Bearer ${token}`,
				"Request-Version": "2",
				"Content-Type": "application/json",
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
		if (response.status === HTTP_UNAUTHORIZED) {
			await this.tokens.signOut();
			throw new NotSignedInError();
		}
		const text = await response.text();
		if (!response.ok) {
			throw new PermanentApiError(path, response.status, text);
		}
		return schema.parse(text === "" ? undefined : JSON.parse(text));
	}
}
