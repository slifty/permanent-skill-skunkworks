import {
	environmentFromSettings,
	resolveEnvironment,
} from "../permanent/environment.ts";
import type { PermanentEnvironment } from "../permanent/environment.ts";

const STELA_ARRAY_LIMIT = 20;
const REQUEST_TIMEOUT_MILLISECONDS = 15_000;

const timedFetch = async (url: string, init?: RequestInit): Promise<Response> =>
	await fetch(url, {
		...init,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
	});
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

interface Check {
	name: string;
	run: (environment: PermanentEnvironment) => Promise<string | undefined>;
}

const recordsQuery = (count: number): string => {
	const params = new URLSearchParams({ pageSize: String(count) });
	for (let index = 1; index <= count; index += 1) {
		params.append("recordIds[]", String(index));
	}
	return params.toString();
};

const expectStatus = async (
	url: string,
	expected: number,
	init?: RequestInit,
): Promise<string | undefined> => {
	const response = await timedFetch(url, init);
	return response.status === expected
		? undefined
		: `expected ${expected}, got ${response.status} from ${url.split("?")[0] ?? url}`;
};

const CHECKS: Check[] = [
	{
		name: "back-end answers",
		run: async ({ apiUrl }) => {
			const response = await timedFetch(`${apiUrl}/auth/loggedIn`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ RequestVO: { csrf: null, data: [{}] } }),
			});
			const body: unknown = await response.json().catch(() => undefined);
			return typeof body === "object" && body !== null && "isSuccessful" in body
				? undefined
				: `response from ${apiUrl}/auth/loggedIn has no "isSuccessful" field (status ${response.status})`;
		},
	},
	{
		name: "stela answers on its own host",
		run: async ({ stelaUrl }) =>
			await expectStatus(`${stelaUrl}/health`, HTTP_OK),
	},
	{
		name: `stela accepts ${STELA_ARRAY_LIMIT} record IDs in one request`,
		run: async ({ stelaUrl }) =>
			await expectStatus(
				`${stelaUrl}/records?${recordsQuery(STELA_ARRAY_LIMIT)}`,
				HTTP_OK,
			),
	},
	{
		name: `stela still rejects more than ${STELA_ARRAY_LIMIT} record IDs`,
		run: async ({ stelaUrl }) =>
			await expectStatus(
				`${stelaUrl}/records?${recordsQuery(STELA_ARRAY_LIMIT + 1)}`,
				HTTP_BAD_REQUEST,
			),
	},
];

const environmentFor = (name: string | undefined): PermanentEnvironment =>
	name === undefined
		? environmentFromSettings(process.env)
		: resolveEnvironment(name);

const main = async (): Promise<boolean> => {
	const environment = environmentFor(process.argv[2]);
	process.stdout.write(
		`Smoke-checking ${environment.name} (${environment.apiUrl}, ${environment.stelaUrl})\n`,
	);
	const results = await Promise.all(
		CHECKS.map(async (check) => ({
			name: check.name,
			problem: await check
				.run(environment)
				.catch((error: unknown) =>
					error instanceof Error ? error.message : String(error),
				),
		})),
	);
	for (const { name, problem } of results) {
		process.stdout.write(
			`${problem === undefined ? "ok  " : "FAIL"} ${name}${problem === undefined ? "" : `: ${problem}`}\n`,
		);
	}
	return results.every((result) => result.problem === undefined);
};

if (!(await main())) {
	process.exitCode = 1;
}
