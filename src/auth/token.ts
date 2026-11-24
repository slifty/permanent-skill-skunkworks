import { z } from "zod";

const SECONDS_TO_MILLISECONDS = 1000;
const EXPIRY_MARGIN_MILLISECONDS = 60_000;

const jwtPayload = z.looseObject({ exp: z.number().optional() });

export const tokenExpiry = (token: string): Date | undefined => {
	const [, payload] = token.split(".");
	if (payload === undefined) {
		return undefined;
	}
	try {
		const parsed = jwtPayload.safeParse(
			JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
		);
		return parsed.success && parsed.data.exp !== undefined
			? new Date(parsed.data.exp * SECONDS_TO_MILLISECONDS)
			: undefined;
	} catch (_error) {
		return undefined;
	}
};

export const isTokenUsable = (token: string, now = new Date()): boolean => {
	const expiry = tokenExpiry(token);
	return (
		expiry === undefined ||
		expiry.getTime() - EXPIRY_MARGIN_MILLISECONDS > now.getTime()
	);
};
