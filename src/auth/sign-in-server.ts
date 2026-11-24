import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { LegacyApiError } from "../permanent/legacy-api.ts";
import { logIn, verifyMfa } from "./password-login.ts";
import {
	credentialsPage,
	donePage,
	expiredPage,
	mfaPage,
} from "./sign-in-page.ts";
import type { MfaRequired, SignedIn } from "./password-login.ts";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

const LOOPBACK = "127.0.0.1";
const MAX_BODY_BYTES = 16_384;
const NONCE_BYTES = 24;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;
const HTTP_TOO_LARGE = 413;
const HTTP_SERVER_ERROR = 500;

const FRIENDLY_ERRORS: Record<string, string> = {
	"warning.signin.unknown":
		"That email and password didn't match. Please try again.",
	"warning.auth.token_does_not_match":
		"That code didn't match. Please check it and try again.",
	"warning.auth.token_expired": "That code has expired. Please sign in again.",
};

const describeError = (error: unknown): string => {
	if (error instanceof LegacyApiError) {
		const known = error.messages
			.map((message) => FRIENDLY_ERRORS[message])
			.find((message) => message !== undefined);
		return known ?? "Permanent couldn't sign you in. Please try again.";
	}
	return "Couldn't reach Permanent. Check your connection and try again.";
};

const readForm = async (
	request: IncomingMessage,
): Promise<URLSearchParams | undefined> => {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of request) {
		const piece: unknown = chunk;
		const buffer = Buffer.isBuffer(piece) ? piece : Buffer.from(String(piece));
		size += buffer.length;
		if (size > MAX_BODY_BYTES) {
			request.destroy();
			return undefined;
		}
		chunks.push(buffer);
	}
	return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
};

const send = (response: ServerResponse, status: number, html: string): void => {
	response.writeHead(status, {
		"Content-Type": "text/html; charset=utf-8",
		"Cache-Control": "no-store",
		"Content-Security-Policy":
			"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
		"Referrer-Policy": "no-referrer",
	});
	response.end(html);
};

export interface SignInServerOptions {
	apiUrl: string;
	environment: string;
	lifetimeMilliseconds: number;
	onSignedIn: (signedIn: SignedIn) => Promise<boolean>;
}

export class SignInServer {
	private readonly completion = Promise.withResolvers<SignedIn | undefined>();
	private readonly options: SignInServerOptions;
	private readonly nonce = randomBytes(NONCE_BYTES).toString("base64url");
	private readonly server: Server;
	private pendingMfa: MfaRequired | undefined = undefined;
	private expiry: NodeJS.Timeout | undefined = undefined;
	private stopped = false;

	public constructor(options: SignInServerOptions) {
		this.options = options;
		this.server = createServer((request, response) => {
			this.handle(request, response).catch(() => {
				if (response.headersSent) {
					response.end();
				} else {
					send(response, HTTP_SERVER_ERROR, expiredPage());
				}
			});
		});
	}

	public get isStopped(): boolean {
		return this.stopped;
	}

	public get done(): Promise<SignedIn | undefined> {
		return this.completion.promise;
	}

	public async start(): Promise<string> {
		this.server.listen(0, LOOPBACK);
		await once(this.server, "listening");
		this.expiry = setTimeout(() => {
			this.stop();
		}, this.options.lifetimeMilliseconds);
		const address = this.server.address();
		if (address === null || typeof address === "string") {
			throw new Error("The sign-in page could not start");
		}
		return `http://${LOOPBACK}:${address.port}/${this.nonce}`;
	}

	public stop(result?: SignedIn): void {
		this.stopped = true;
		clearTimeout(this.expiry);
		this.server.close();
		this.server.closeAllConnections();
		this.completion.resolve(result);
	}

	private path(action: string): string {
		return `/${this.nonce}/${action}`;
	}

	private async handle(
		request: IncomingMessage,
		response: ServerResponse,
	): Promise<void> {
		const { pathname } = new URL(request.url ?? "/", `http://${LOOPBACK}`);
		if (!pathname.startsWith(`/${this.nonce}`)) {
			send(response, HTTP_NOT_FOUND, expiredPage());
			return;
		}
		if (request.method === "GET") {
			send(
				response,
				HTTP_OK,
				credentialsPage(this.options.environment, this.path("login")),
			);
			return;
		}
		const form = await readForm(request);
		if (form === undefined) {
			send(response, HTTP_TOO_LARGE, expiredPage());
			return;
		}
		if (pathname === this.path("login")) {
			await this.handleLogin(form, response);
		} else if (pathname === this.path("verify")) {
			await this.handleVerify(form, response);
		} else {
			send(response, HTTP_GONE, expiredPage());
		}
	}

	private async handleLogin(
		form: URLSearchParams,
		response: ServerResponse,
	): Promise<void> {
		const email = form.get("email")?.trim() ?? "";
		const password = form.get("password") ?? "";
		try {
			const result = await logIn(this.options.apiUrl, email, password);
			if (result.status === "mfa-required") {
				this.pendingMfa = result;
				send(response, HTTP_OK, mfaPage(this.path("verify")));
				return;
			}
			await this.finish(result, response);
		} catch (error) {
			send(
				response,
				HTTP_OK,
				credentialsPage(
					this.options.environment,
					this.path("login"),
					describeError(error),
				),
			);
		}
	}

	private async handleVerify(
		form: URLSearchParams,
		response: ServerResponse,
	): Promise<void> {
		const { pendingMfa: pending } = this;
		if (pending === undefined) {
			send(response, HTTP_GONE, expiredPage());
			return;
		}
		try {
			const result = await verifyMfa(
				this.options.apiUrl,
				pending,
				form.get("code") ?? "",
			);
			await this.finish(result, response);
		} catch (error) {
			send(
				response,
				HTTP_OK,
				mfaPage(this.path("verify"), describeError(error)),
			);
		}
	}

	private async finish(
		result: SignedIn,
		response: ServerResponse,
	): Promise<void> {
		if (this.stopped) {
			send(response, HTTP_GONE, expiredPage());
			return;
		}
		const kept = await this.options.onSignedIn(result);
		this.pendingMfa = undefined;
		if (!kept) {
			send(response, HTTP_GONE, expiredPage());
			return;
		}
		response.once("finish", () => {
			this.stop(result);
		});
		send(response, HTTP_OK, donePage(result.email));
	}
}
