import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fakeToken, startFakePermanent } from "../testing/fake-permanent.ts";
import { CredentialStore } from "./credentials.ts";
import { InterimAuth, NotSignedInError } from "./interim-auth.ts";
import type { FakeAccount, FakePermanent } from "../testing/fake-permanent.ts";

const ACCOUNT: FakeAccount = {
	email: "rosa@example.com",
	password: "correct horse",
	name: "Rosa Ortiz",
};

const post = async (
	url: string,
	form: Record<string, string>,
): Promise<string> => {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(form).toString(),
	});
	return await response.text();
};

interface Fixture {
	auth: InterimAuth;
	fake: FakePermanent;
	directory: string;
	opened: string[];
	token: string;
}

let fixture: Fixture | undefined = undefined;

const setUp = async (
	account: FakeAccount = ACCOUNT,
	signInLifetimeMilliseconds?: number,
): Promise<Fixture> => {
	const token = fakeToken();
	const fake = await startFakePermanent(account, token);
	const directory = await mkdtemp(join(tmpdir(), "auth-test-"));
	const opened: string[] = [];
	const auth = new InterimAuth({
		environment: { name: "test", apiUrl: fake.apiUrl, webUrl: "http://web" },
		store: new CredentialStore(directory, "test"),
		openBrowser: (url) => {
			opened.push(url);
		},
		...(signInLifetimeMilliseconds === undefined
			? {}
			: { signInLifetimeMilliseconds }),
	});
	fixture = { auth, fake, directory, opened, token };
	return fixture;
};

afterEach(async () => {
	const current = fixture;
	fixture = undefined;
	await current?.auth.signOut();
	await current?.fake.close();
});

describe("InterimAuth", () => {
	it("is signed out until the member signs in", async () => {
		const { auth } = await setUp();

		expect((await auth.status()).signedIn).toBe(false);
		await expect(auth.getAccessToken()).rejects.toBeInstanceOf(
			NotSignedInError,
		);
	});

	it("signs in through the local page and stores the token privately", async () => {
		const { auth, directory, opened, token } = await setUp();

		const url = await auth.startSignIn();
		const form = await (await fetch(url)).text();
		const done = await post(`${url}/login`, {
			email: ACCOUNT.email,
			password: ACCOUNT.password,
		});

		expect(opened).toEqual([url]);
		expect(form).toContain('type="password"');
		expect(done).toContain("You're signed in");
		expect(await auth.getAccessToken()).toBe(token);
		expect(await auth.status()).toMatchObject({
			signedIn: true,
			email: ACCOUNT.email,
			name: ACCOUNT.name,
		});
		const { mode } = await stat(join(directory, "credentials.test.json"));
		expect(mode & 0o777).toBe(0o600);
	});

	it("asks for a verification code and keeps the session between steps", async () => {
		const { auth, fake, token } = await setUp({
			...ACCOUNT,
			mfaCode: "123456",
		});

		const url = await auth.startSignIn();
		const mfa = await post(`${url}/login`, {
			email: ACCOUNT.email,
			password: ACCOUNT.password,
		});
		const wrong = await post(`${url}/verify`, { code: "000000" });
		const done = await post(`${url}/verify`, { code: " 123456 " });

		expect(mfa).toContain("Verification code");
		expect(wrong).toContain("That code didn&#39;t match");
		expect(done).toContain("You're signed in");
		expect(await auth.getAccessToken()).toBe(token);
		const verify = fake.requests.filter(
			(request) => request.path === "/api/auth/verify",
		);
		expect(verify[0]?.headers.cookie).toBe("PHPSESSID=session-1");
	});

	it("shows a friendly error for a wrong password", async () => {
		const { auth } = await setUp();

		const url = await auth.startSignIn();
		const page = await post(`${url}/login`, {
			email: ACCOUNT.email,
			password: "wrong",
		});

		expect(page).toContain("That email and password didn&#39;t match");
		expect((await auth.status()).signedIn).toBe(false);
	});

	it("never sends the password anywhere but Permanent's login endpoint", async () => {
		const { auth, fake } = await setUp();

		const url = await auth.startSignIn();
		await post(`${url}/login`, {
			email: ACCOUNT.email,
			password: ACCOUNT.password,
		});

		const withPassword = fake.requests.filter((request) =>
			JSON.stringify(request.body).includes(ACCOUNT.password),
		);
		expect(withPassword.map((request) => request.path)).toEqual([
			"/api/auth/login",
		]);
	});

	it("rejects requests without the page's secret path", async () => {
		const { auth } = await setUp();

		const url = await auth.startSignIn();
		const { origin } = new URL(url);
		const response = await fetch(`${origin}/login`, { method: "POST" });

		expect(response.status).toBe(404);
	});

	it("reports completion to a waiting caller", async () => {
		const { auth } = await setUp();

		const url = await auth.startSignIn();
		const waiting = auth.waitForSignIn(5000);
		await post(`${url}/login`, {
			email: ACCOUNT.email,
			password: ACCOUNT.password,
		});

		expect((await waiting).signedIn).toBe(true);
	});

	it("does not keep a sign-in that finishes after signing out", async () => {
		const { auth } = await setUp({ ...ACCOUNT, loginDelayMilliseconds: 100 });

		const url = await auth.startSignIn();
		const pending = post(`${url}/login`, {
			email: ACCOUNT.email,
			password: ACCOUNT.password,
		}).catch(() => "connection closed");
		await delay(20);
		await auth.signOut();
		await pending;

		expect((await auth.status()).signedIn).toBe(false);
	});

	it("refuses oversized form bodies, even when chunked", async () => {
		const { auth } = await setUp();
		const url = await auth.startSignIn();
		const chunk = new TextEncoder().encode("a".repeat(4096));
		const body = new ReadableStream<Uint8Array>({
			start: (controller) => {
				for (let index = 0; index < 8; index += 1) {
					controller.enqueue(chunk);
				}
				controller.close();
			},
		});

		const outcome = await fetch(`${url}/login`, {
			method: "POST",
			body,
			duplex: "half",
		})
			.then((response) => response.status)
			.catch(() => "connection closed");

		expect(outcome).not.toBe(200);
		expect(await (await fetch(url)).text()).toContain('type="password"');
	});

	it("runs one sign-in page at a time", async () => {
		const { auth } = await setUp();

		const [first, second] = await Promise.all([
			auth.startSignIn(),
			auth.startSignIn(),
		]);

		expect(second).toBe(first);
	});

	it("does not keep a sign-in that finishes after the link expired", async () => {
		const { auth } = await setUp(
			{ ...ACCOUNT, loginDelayMilliseconds: 150 },
			50,
		);

		const url = await auth.startSignIn();
		await post(`${url}/login`, {
			email: ACCOUNT.email,
			password: ACCOUNT.password,
		}).catch(() => "connection closed");

		expect((await auth.status()).signedIn).toBe(false);
	});

	it("forgets the token on sign out", async () => {
		const { auth } = await setUp();
		const url = await auth.startSignIn();
		await post(`${url}/login`, {
			email: ACCOUNT.email,
			password: ACCOUNT.password,
		});

		await auth.signOut();

		expect((await auth.status()).signedIn).toBe(false);
	});
});
