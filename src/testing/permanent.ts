import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CredentialStore } from "../auth/credentials.ts";
import { InterimAuth } from "../auth/interim-auth.ts";
import { PermanentClient } from "../permanent/api.ts";
import { UploadLedger } from "../uploads/ledger.ts";
import { fakeToken, startFakePermanent } from "./fake-permanent.ts";
import type { ServerDependencies } from "../server.ts";
import type { FakeAccount, FakePermanent } from "./fake-permanent.ts";

export const TEST_ACCOUNT: FakeAccount = {
	email: "rosa@example.com",
	password: "correct horse",
	name: "Rosa Ortiz",
};

export interface TestPermanent extends ServerDependencies {
	fake: FakePermanent;
	token: string;
	signIn: () => Promise<void>;
	cleanUp: () => Promise<void>;
}

export const submitForm = async (
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

export const startTestPermanent = async (
	account: FakeAccount = TEST_ACCOUNT,
): Promise<TestPermanent> => {
	const token = fakeToken();
	const fake = await startFakePermanent(account, token);
	const environment = {
		name: "test",
		apiUrl: fake.apiUrl,
		webUrl: "http://web",
	};
	const dataDirectory = await mkdtemp(join(tmpdir(), "permanent-test-"));
	const auth = new InterimAuth({
		environment,
		store: new CredentialStore(dataDirectory, "test"),
		openBrowser: () => undefined,
	});
	return {
		fake,
		token,
		auth,
		client: new PermanentClient(environment, auth),
		ledger: new UploadLedger(dataDirectory, "test"),
		uploadOptions: { pollIntervalMilliseconds: 10 },
		signIn: async () => {
			const url = await auth.startSignIn();
			await submitForm(`${url}/login`, {
				email: account.email,
				password: account.password,
			});
		},
		cleanUp: async () => {
			await auth.signOut();
			await fake.close();
		},
	};
};
