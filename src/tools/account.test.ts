import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { CredentialStore } from "../auth/credentials.ts";
import { InterimAuth } from "../auth/interim-auth.ts";
import { callTool, connectClient } from "../testing/client.ts";
import { startFakePermanent } from "../testing/fake-permanent.ts";
import type { FakePermanent } from "../testing/fake-permanent.ts";

const ACCOUNT = {
	email: "rosa@example.com",
	password: "correct horse",
	name: "Rosa Ortiz",
};

let cleanUp: Array<() => Promise<void>> = [];

afterEach(async () => {
	const pending = cleanUp;
	cleanUp = [];
	await Promise.all(
		pending.map(async (step) => {
			await step();
		}),
	);
});

const setUp = async (): Promise<{
	fake: FakePermanent;
	auth: InterimAuth;
}> => {
	const fake = await startFakePermanent(ACCOUNT);
	const auth = new InterimAuth({
		environment: { name: "test", apiUrl: fake.apiUrl, webUrl: "http://web" },
		store: new CredentialStore(
			await mkdtemp(join(tmpdir(), "account-test-")),
			"test",
		),
		openBrowser: () => undefined,
	});
	cleanUp.push(async () => {
		await auth.signOut();
		await fake.close();
	});
	return { fake, auth };
};

describe("account tools", () => {
	it("hands Claude a local sign-in link and reports when it is used", async () => {
		const { auth } = await setUp();
		const client = await connectClient({ auth });

		const started = await callTool(client, "sign_in", {});
		const { signInUrl } = z
			.object({ signInUrl: z.string() })
			.parse(started.json());
		await fetch(`${signInUrl}/login`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				email: ACCOUNT.email,
				password: ACCOUNT.password,
			}).toString(),
		});
		const checked = await callTool(client, "check_sign_in", { waitSeconds: 5 });

		expect(signInUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//v);
		expect(started.text).not.toContain(ACCOUNT.password);
		expect(checked.json()).toMatchObject({
			signedIn: true,
			email: ACCOUNT.email,
		});
	});

	it("does not start a new sign-in when already signed in", async () => {
		const { auth } = await setUp();
		const client = await connectClient({ auth });
		const url = await auth.startSignIn();
		await fetch(`${url}/login`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				email: ACCOUNT.email,
				password: ACCOUNT.password,
			}).toString(),
		});

		const outcome = await callTool(client, "sign_in", {});

		expect(outcome.json()).toMatchObject({ alreadySignedIn: true });
	});

	it("signs out", async () => {
		const { auth } = await setUp();
		const client = await connectClient({ auth });

		const outcome = await callTool(client, "sign_out", {});

		expect(outcome.json()).toEqual({ signedIn: false });
	});
});
