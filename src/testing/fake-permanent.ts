import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { text } from "node:stream/consumers";
import { z } from "zod";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

export interface FakeAccount {
	email: string;
	password: string;
	name: string;
	mfaCode?: string;
	loginDelayMilliseconds?: number;
}

export interface FakePermanent {
	apiUrl: string;
	requests: Array<{
		path: string;
		body: unknown;
		headers: IncomingMessage["headers"];
	}>;
	close: () => Promise<void>;
}

export const fakeToken = (expiresInSeconds = 3600): string => {
	const encode = (value: object): string =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
	return `${encode({ alg: "none" })}.${encode({ exp, sub: "account-1" })}.signature`;
};

const reply = (
	response: ServerResponse,
	body: object,
	cookie?: string,
): void => {
	response.writeHead(200, {
		"Content-Type": "application/json",
		...(cookie === undefined
			? {}
			: { "Set-Cookie": `${cookie}; Path=/; HttpOnly` }),
	});
	response.end(JSON.stringify({ csrf: "csrf-1", ...body }));
};

const failure = (message: string): object => ({
	isSuccessful: false,
	Results: [{ data: null, message: [message], status: false }],
});

const success = (account: FakeAccount, token: string, vo: string): object => ({
	isSuccessful: true,
	Results: [
		{
			data: [
				{
					AccountVO: { primaryEmail: account.email, fullName: account.name },
					[vo]: { key: "authToken", value: token },
				},
			],
			message: ["Successful Login."],
			status: true,
		},
	],
});

const legacyBody = z.object({
	RequestVO: z.object({
		data: z.array(z.record(z.string(), z.record(z.string(), z.unknown()))),
	}),
});

type LegacyEntry = z.infer<typeof legacyBody>["RequestVO"]["data"][number];

interface FakeState {
	account: FakeAccount;
	token: string;
	mfaSessions: Set<string>;
}

const handleLogin = (
	state: FakeState,
	entry: LegacyEntry,
	response: ServerResponse,
): void => {
	const { account, token, mfaSessions } = state;
	const matches =
		entry.AccountVO?.primaryEmail === account.email &&
		entry.AccountPasswordVO?.password === account.password;
	if (!matches) {
		reply(response, failure("warning.signin.unknown"));
		return;
	}
	if (account.mfaCode === undefined) {
		reply(response, success(account, token, "SimpleVO"));
		return;
	}
	const sessionId = `session-${mfaSessions.size + 1}`;
	mfaSessions.add(sessionId);
	reply(response, failure("warning.auth.mfaToken"), `PHPSESSID=${sessionId}`);
};

const handleVerify = (
	state: FakeState,
	entry: LegacyEntry,
	request: IncomingMessage,
	response: ServerResponse,
): void => {
	const sessionId = /PHPSESSID=(?<id>[^;]+)/v.exec(request.headers.cookie ?? "")
		?.groups?.id;
	if (sessionId === undefined || !state.mfaSessions.has(sessionId)) {
		reply(response, failure("warning.auth.token_expired"));
		return;
	}
	if (entry.AuthVO?.token === state.account.mfaCode) {
		reply(response, success(state.account, state.token, "AuthSimpleVO"));
		return;
	}
	reply(response, failure("warning.auth.token_does_not_match"));
};

export const startFakePermanent = async (
	account: FakeAccount,
	token = fakeToken(),
): Promise<FakePermanent> => {
	const requests: FakePermanent["requests"] = [];
	const state: FakeState = { account, token, mfaSessions: new Set() };
	const server: Server = createServer((request, response) => {
		void (async (): Promise<void> => {
			const body = legacyBody.parse(JSON.parse(await text(request)));
			requests.push({
				path: request.url ?? "",
				body,
				headers: request.headers,
			});
			const {
				RequestVO: {
					data: [entry = {}],
				},
			} = body;
			if (request.url === "/api/auth/login") {
				await delay(account.loginDelayMilliseconds ?? 0);
				handleLogin(state, entry, response);
			} else if (request.url === "/api/auth/verify") {
				handleVerify(state, entry, request, response);
			} else {
				response.writeHead(404).end();
			}
		})();
	});
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("fake Permanent did not start");
	}
	return {
		apiUrl: `http://127.0.0.1:${address.port}/api`,
		requests,
		close: async () => {
			server.closeAllConnections();
			server.close();
			await once(server, "close");
		},
	};
};
