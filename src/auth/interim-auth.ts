import { setTimeout as delay } from "node:timers/promises";
import { openInBrowser } from "./browser.ts";
import { SignInServer } from "./sign-in-server.ts";
import { isTokenUsable, tokenExpiry } from "./token.ts";
import type { CredentialStore } from "./credentials.ts";
import type { PermanentEnvironment } from "../permanent/environment.ts";

const SIGN_IN_LIFETIME_MILLISECONDS = 600_000;

export class NotSignedInError extends Error {
	public constructor() {
		super(
			"Not signed in to Permanent. Call the sign_in tool and ask the member to finish signing in in their browser.",
		);
	}
}

export interface SignInStatus {
	environment: string;
	signedIn: boolean;
	email?: string;
	name?: string;
	expiresAt?: string;
}

interface ActiveSignIn {
	server: SignInServer;
	url: string;
}

export interface InterimAuthOptions {
	environment: PermanentEnvironment;
	store: CredentialStore;
	openBrowser?: (url: string) => void;
	signInLifetimeMilliseconds?: number;
}

export class InterimAuth {
	private readonly environment: PermanentEnvironment;
	private readonly store: CredentialStore;
	private readonly openBrowser: (url: string) => void;
	private readonly signInLifetimeMilliseconds: number;
	private active: Promise<ActiveSignIn> | undefined = undefined;
	private generation = 0;
	private credentialLock: Promise<unknown> = Promise.resolve();

	public constructor({
		environment,
		store,
		openBrowser = openInBrowser,
		signInLifetimeMilliseconds = SIGN_IN_LIFETIME_MILLISECONDS,
	}: InterimAuthOptions) {
		this.environment = environment;
		this.store = store;
		this.openBrowser = openBrowser;
		this.signInLifetimeMilliseconds = signInLifetimeMilliseconds;
	}

	public async getAccessToken(): Promise<string> {
		const credentials = await this.store.read();
		if (credentials === undefined || !isTokenUsable(credentials.accessToken)) {
			throw new NotSignedInError();
		}
		return credentials.accessToken;
	}

	public async status(): Promise<SignInStatus> {
		const credentials = await this.store.read();
		if (credentials === undefined || !isTokenUsable(credentials.accessToken)) {
			return { environment: this.environment.name, signedIn: false };
		}
		const expiry = tokenExpiry(credentials.accessToken);
		return {
			environment: this.environment.name,
			signedIn: true,
			email: credentials.email,
			...(credentials.name === undefined ? {} : { name: credentials.name }),
			...(expiry === undefined ? {} : { expiresAt: expiry.toISOString() }),
		};
	}

	public async startSignIn(): Promise<string> {
		this.active ??= this.launchSignIn();
		const { url } = await this.active;
		this.openBrowser(url);
		return url;
	}

	public async waitForSignIn(
		timeoutMilliseconds: number,
	): Promise<SignInStatus> {
		const pending = (await this.active)?.server.done;
		if (pending !== undefined) {
			await Promise.race([
				pending,
				delay(timeoutMilliseconds, undefined, { ref: false }),
			]);
		}
		return await this.status();
	}

	public async signOut(): Promise<void> {
		await this.exclusively(async () => {
			this.generation += 1;
			(await this.active)?.server.stop();
			await this.store.clear();
		});
	}

	private async launchSignIn(): Promise<ActiveSignIn> {
		const { generation } = this;
		const server: SignInServer = new SignInServer({
			apiUrl: this.environment.apiUrl,
			environment: this.environment.name,
			lifetimeMilliseconds: this.signInLifetimeMilliseconds,
			onSignedIn: async (signedIn) =>
				await this.exclusively(async () => {
					if (generation !== this.generation || server.isStopped) {
						return false;
					}
					await this.store.write({
						environment: this.environment.name,
						accessToken: signedIn.accessToken,
						email: signedIn.email,
						...(signedIn.name === undefined ? {} : { name: signedIn.name }),
						savedAt: new Date().toISOString(),
					});
					return true;
				}),
		});
		const launched = server.start().then((url) => ({ server, url }));
		launched.catch(() => {
			this.active = undefined;
		});
		void server.done.then(async () => {
			if (this.active !== undefined && (await this.active).server === server) {
				this.active = undefined;
			}
		});
		return await launched;
	}

	private async exclusively<Result>(
		work: () => Promise<Result>,
	): Promise<Result> {
		const result = this.credentialLock.then(work);
		this.credentialLock = result.catch(() => undefined);
		return await result;
	}
}
