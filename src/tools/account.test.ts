import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { callTool, connectClient } from "../testing/client.ts";
import {
	TEST_ACCOUNT,
	startTestPermanent,
	submitForm,
} from "../testing/permanent.ts";
import type { TestPermanent } from "../testing/permanent.ts";

let permanent: TestPermanent | undefined = undefined;

const setUp = async (): Promise<TestPermanent> => {
	permanent = await startTestPermanent();
	return permanent;
};

afterEach(async () => {
	const current = permanent;
	permanent = undefined;
	await current?.cleanUp();
});

describe("account tools", () => {
	it("hands Claude a local sign-in link and reports when it is used", async () => {
		const client = await connectClient(await setUp());

		const started = await callTool(client, "sign_in", {});
		const { signInUrl } = z
			.object({ signInUrl: z.string() })
			.parse(started.json());
		await submitForm(`${signInUrl}/login`, {
			email: TEST_ACCOUNT.email,
			password: TEST_ACCOUNT.password,
		});
		const checked = await callTool(client, "check_sign_in", {
			waitSeconds: 5,
		});

		expect(signInUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//v);
		expect(started.text).not.toContain(TEST_ACCOUNT.password);
		expect(checked.json()).toMatchObject({
			signedIn: true,
			email: TEST_ACCOUNT.email,
		});
	});

	it("does not start a new sign-in when already signed in", async () => {
		const test = await setUp();
		const client = await connectClient(test);
		await test.signIn();

		const outcome = await callTool(client, "sign_in", {});

		expect(outcome.json()).toMatchObject({ alreadySignedIn: true });
	});

	it("signs out", async () => {
		const client = await connectClient(await setUp());

		const outcome = await callTool(client, "sign_out", {});

		expect(outcome.json()).toEqual({ signedIn: false });
	});
});
