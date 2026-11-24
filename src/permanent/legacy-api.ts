import { z } from "zod";

const legacyResponse = z.looseObject({
	isSuccessful: z.boolean(),
	csrf: z.unknown().optional(),
	Results: z
		.array(
			z.looseObject({
				data: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
				message: z.array(z.string()).optional(),
				status: z.boolean().optional(),
			}),
		)
		.default([]),
});

export type LegacyResponse = z.infer<typeof legacyResponse>;

export class LegacySession {
	private readonly cookies = new Map<string, string>();
	private csrf: unknown = null;

	public requestHeaders(): Record<string, string> {
		const cookie = [...this.cookies]
			.map(([name, value]) => `${name}=${value}`)
			.join("; ");
		return cookie === "" ? {} : { Cookie: cookie };
	}

	public requestCsrf(): unknown {
		return this.csrf;
	}

	public update(headers: Headers, body: LegacyResponse): void {
		for (const setCookie of headers.getSetCookie()) {
			const [pair = ""] = setCookie.split(";");
			const separator = pair.indexOf("=");
			if (separator > 0) {
				this.cookies.set(
					pair.slice(0, separator).trim(),
					pair.slice(separator + 1).trim(),
				);
			}
		}
		const { csrf } = body;
		if (csrf !== undefined) {
			this.csrf = csrf;
		}
	}
}

export class LegacyApiError extends Error {
	public readonly messages: string[];

	public constructor(endpoint: string, messages: string[]) {
		super(
			`Permanent rejected ${endpoint}: ${messages.length > 0 ? messages.join(", ") : "no reason given"}`,
		);
		this.messages = messages;
	}
}

export interface LegacyRequest {
	apiUrl: string;
	endpoint: string;
	data: Array<Record<string, unknown>>;
	session?: LegacySession;
	token?: string;
}

export const postLegacy = async ({
	apiUrl,
	endpoint,
	data,
	session,
	token,
}: LegacyRequest): Promise<LegacyResponse> => {
	const response = await fetch(`${apiUrl}${endpoint}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
			...session?.requestHeaders(),
		},
		body: JSON.stringify({
			RequestVO: { csrf: session?.requestCsrf() ?? null, data },
		}),
	});
	const body = legacyResponse.parse(await response.json());
	session?.update(response.headers, body);
	return body;
};

export const legacyMessages = (response: LegacyResponse): string[] =>
	response.Results.flatMap((result) => result.message ?? []);

export const findSimpleValue = (
	response: LegacyResponse,
	key: string,
): string | undefined => {
	for (const result of response.Results) {
		for (const entry of result.data ?? []) {
			for (const value of Object.values(entry)) {
				const parsed = z
					.object({ key: z.string(), value: z.string() })
					.safeParse(value);
				if (parsed.success && parsed.data.key === key) {
					return parsed.data.value;
				}
			}
		}
	}
	return undefined;
};

export const findValueObject = (
	response: LegacyResponse,
	name: string,
): unknown => {
	for (const result of response.Results) {
		for (const entry of result.data ?? []) {
			if (name in entry) {
				return entry[name];
			}
		}
	}
	return undefined;
};
