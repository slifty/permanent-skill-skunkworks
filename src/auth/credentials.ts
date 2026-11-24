import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

const OWNER_ONLY = 0o600;
const OWNER_ONLY_DIRECTORY = 0o700;

const storedCredentials = z.object({
	environment: z.string(),
	accessToken: z.string(),
	email: z.string(),
	name: z.string().optional(),
	savedAt: z.string(),
});

export type StoredCredentials = z.infer<typeof storedCredentials>;

const parseJson = (contents: string): unknown => {
	try {
		return JSON.parse(contents);
	} catch (_error) {
		return undefined;
	}
};

export const defaultDataDirectory = (): string => {
	const {
		env: { PERMANENT_DATA_DIR: fromPlugin },
	} = process;
	return fromPlugin === undefined || fromPlugin.trim() === ""
		? join(homedir(), ".permanent-claude")
		: fromPlugin;
};

export class CredentialStore {
	private readonly path: string;

	public constructor(dataDirectory: string, environment: string) {
		this.path = join(dataDirectory, `credentials.${environment}.json`);
	}

	public async read(): Promise<StoredCredentials | undefined> {
		const contents = await readFile(this.path, "utf8").catch(() => undefined);
		if (contents === undefined) {
			return undefined;
		}
		const parsed = storedCredentials.safeParse(parseJson(contents));
		return parsed.success ? parsed.data : undefined;
	}

	public async write(credentials: StoredCredentials): Promise<void> {
		const directory = dirname(this.path);
		await mkdir(directory, { recursive: true, mode: OWNER_ONLY_DIRECTORY });
		await chmod(directory, OWNER_ONLY_DIRECTORY);
		await writeFile(this.path, JSON.stringify(credentials), {
			encoding: "utf8",
			mode: OWNER_ONLY,
		});
		await chmod(this.path, OWNER_ONLY);
	}

	public async clear(): Promise<void> {
		await rm(this.path, { force: true });
	}
}
