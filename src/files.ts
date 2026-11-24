import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const OWNER_ONLY = 0o600;
const SUFFIX_BYTES = 6;

export const writeFileAtomically = async (
	path: string,
	contents: string,
): Promise<void> => {
	await mkdir(dirname(path), { recursive: true });
	const temporary = join(
		dirname(path),
		`.${randomBytes(SUFFIX_BYTES).toString("hex")}.tmp`,
	);
	try {
		await writeFile(temporary, contents, {
			encoding: "utf8",
			mode: OWNER_ONLY,
		});
		await rename(temporary, path);
	} catch (error) {
		await rm(temporary, { force: true });
		throw error;
	}
};
