import { z } from "zod";
import { environmentNote } from "../permanent/environment.ts";
import { jsonResult } from "./result.ts";
import type { InterimAuth } from "../auth/interim-auth.ts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const MAX_WAIT_SECONDS = 120;
const MILLISECONDS_PER_SECOND = 1000;

export const registerAccountTools = (
	server: McpServer,
	auth: InterimAuth,
): void => {
	server.registerTool(
		"sign_in",
		{
			title: "Sign in to Permanent",
			description:
				"Open a Permanent sign-in page in the member's browser on this computer. The member types their email and password (and a verification code, if their account uses one) into that page, not into the chat. Returns the page's link in case the browser didn't open. Afterwards, call check_sign_in to wait for them to finish.",
			inputSchema: {
				switchAccount: z
					.boolean()
					.default(false)
					.describe("Sign in again even if already signed in"),
			},
			annotations: { readOnlyHint: false, openWorldHint: true },
		},
		async ({ switchAccount }) => {
			const current = await auth.status();
			if (current.signedIn && !switchAccount) {
				return jsonResult({ alreadySignedIn: true, ...current });
			}
			const url = await auth.startSignIn();
			return jsonResult({
				signInUrl: url,
				instructions:
					"A sign-in page should have opened in the member's browser. If it didn't, give them this link. It only works on this computer and expires in 10 minutes. Then call check_sign_in.",
			});
		},
	);

	server.registerTool(
		"check_sign_in",
		{
			title: "Check Permanent sign-in",
			description:
				"Report whether the member is signed in to Permanent, and as whom. Optionally waits for a sign-in that is in progress to finish.",
			inputSchema: {
				waitSeconds: z
					.number()
					.min(0)
					.max(MAX_WAIT_SECONDS)
					.default(0)
					.describe("How long to wait for an in-progress sign-in"),
			},
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async ({ waitSeconds }) => {
			const status = await auth.waitForSignIn(
				waitSeconds * MILLISECONDS_PER_SECOND,
			);
			const note = environmentNote(status.environment);
			return jsonResult(
				note === undefined ? status : { ...status, environmentNote: note },
			);
		},
	);

	server.registerTool(
		"sign_out",
		{
			title: "Sign out of Permanent",
			description: "Forget the member's Permanent sign-in on this computer.",
			inputSchema: {},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async () => {
			await auth.signOut();
			return jsonResult({ signedIn: false });
		},
	);
};
