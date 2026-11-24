import { z } from "zod";
import {
	LegacyApiError,
	LegacySession,
	findSimpleValue,
	findValueObject,
	legacyMessages,
	postLegacy,
} from "../permanent/legacy-api.ts";
import type { LegacyResponse } from "../permanent/legacy-api.ts";

const MFA_REQUIRED = "warning.auth.mfaToken";
const MFA_TOKEN_TYPE = "type.auth.mfaValidation";

const accountVo = z.looseObject({
	primaryEmail: z.string().optional(),
	fullName: z.string().nullable().optional(),
});

export interface SignedIn {
	status: "signed-in";
	accessToken: string;
	email: string;
	name?: string;
}

export interface MfaRequired {
	status: "mfa-required";
	email: string;
	session: LegacySession;
}

const signedInFrom = (
	response: LegacyResponse,
	email: string,
	endpoint: string,
): SignedIn => {
	const accessToken = findSimpleValue(response, "authToken");
	if (!response.isSuccessful || accessToken === undefined) {
		throw new LegacyApiError(endpoint, legacyMessages(response));
	}
	const account = accountVo.safeParse(findValueObject(response, "AccountVO"));
	const name = account.success ? account.data.fullName : undefined;
	return {
		status: "signed-in",
		accessToken,
		email: account.success ? (account.data.primaryEmail ?? email) : email,
		...(name === undefined || name === null ? {} : { name }),
	};
};

export const logIn = async (
	apiUrl: string,
	email: string,
	password: string,
): Promise<SignedIn | MfaRequired> => {
	const session = new LegacySession();
	const response = await postLegacy({
		apiUrl,
		endpoint: "/auth/login",
		data: [
			{
				AccountVO: {
					primaryEmail: email,
					rememberMe: false,
					keepLoggedIn: true,
				},
				AccountPasswordVO: { password },
			},
		],
		session,
	});
	if (
		!response.isSuccessful &&
		legacyMessages(response).includes(MFA_REQUIRED)
	) {
		return { status: "mfa-required", email, session };
	}
	return signedInFrom(response, email, "/auth/login");
};

export const verifyMfa = async (
	apiUrl: string,
	pending: MfaRequired,
	code: string,
): Promise<SignedIn> => {
	const response = await postLegacy({
		apiUrl,
		endpoint: "/auth/verify",
		data: [
			{
				AccountVO: { primaryEmail: pending.email },
				AuthVO: { token: code.trim(), type: MFA_TOKEN_TYPE },
			},
		],
		session: pending.session,
	});
	return signedInFrom(response, pending.email, "/auth/verify");
};
