import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomically } from "../files.ts";

const publication = z.discriminatedUnion("state", [
	z.object({
		state: z.literal("copying"),
		name: z.string(),
		existingPublicFolderIds: z.array(z.number()),
		startedAt: z.string(),
	}),
	z.object({ state: z.literal("published"), publicFolderId: z.number() }),
]);

const publicationsFile = z.record(z.string(), publication);

export type Publication = z.infer<typeof publication>;

export class PublicationStore {
	private readonly path: string;
	private pending: Promise<unknown> = Promise.resolve();

	public constructor(dataDirectory: string, environment: string) {
		this.path = join(dataDirectory, `publications.${environment}.json`);
	}

	public async get(sourceFolderId: number): Promise<Publication | undefined> {
		return (await this.read())[String(sourceFolderId)];
	}

	public async set(sourceFolderId: number, value: Publication): Promise<void> {
		const next = this.pending.then(async () => {
			const entries = await this.read();
			await writeFileAtomically(
				this.path,
				JSON.stringify({ ...entries, [String(sourceFolderId)]: value }),
			);
		});
		this.pending = next.catch(() => undefined);
		await next;
	}

	public async remove(sourceFolderId: number): Promise<void> {
		const next = this.pending.then(async () => {
			const { [String(sourceFolderId)]: _removed, ...rest } = await this.read();
			await writeFileAtomically(this.path, JSON.stringify(rest));
		});
		this.pending = next.catch(() => undefined);
		await next;
	}

	private async read(): Promise<Record<string, Publication>> {
		const contents = await readFile(this.path, "utf8").catch(
			(error: unknown) => {
				if (
					error instanceof Error &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return undefined;
				}
				throw error;
			},
		);
		if (contents === undefined) {
			return {};
		}
		try {
			return publicationsFile.parse(JSON.parse(contents));
		} catch (error) {
			throw new Error(
				`The record of published folders at ${this.path} can't be read, so publishing now could make a duplicate public copy. Move that file aside to start a fresh record, then try again.`,
				{ cause: error },
			);
		}
	}
}
