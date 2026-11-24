import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomically } from "../files.ts";

const ledgerEntry = z.object({
	folderId: z.number(),
	sha256: z.string(),
	recordId: z.number(),
	path: z.string(),
	fileName: z.string(),
	uploadedAt: z.string(),
});

const ledgerFile = z.object({ entries: z.array(ledgerEntry) });

export type LedgerEntry = z.infer<typeof ledgerEntry>;

export class UnreadableLedgerError extends Error {
	public constructor(path: string) {
		super(
			`The record of earlier uploads at ${path} can't be read, so uploading now could duplicate files. Move that file aside to start a fresh record, then try again.`,
		);
	}
}

const parseLedger = (path: string, contents: string): LedgerEntry[] => {
	try {
		return ledgerFile.parse(JSON.parse(contents)).entries;
	} catch (_error) {
		throw new UnreadableLedgerError(path);
	}
};

export class UploadLedger {
	private readonly path: string;
	private pending: Promise<unknown> = Promise.resolve();
	private readonly folderLocks = new Map<number, Promise<unknown>>();

	public constructor(dataDirectory: string, environment: string) {
		this.path = join(dataDirectory, `uploads.${environment}.json`);
	}

	public async forFolder(folderId: number): Promise<Map<string, LedgerEntry>> {
		const entries = await this.read();
		return new Map(
			entries
				.filter((entry) => entry.folderId === folderId)
				.map((entry) => [entry.sha256, entry]),
		);
	}

	public async exclusively<Result>(
		folderId: number,
		work: () => Promise<Result>,
	): Promise<Result> {
		const previous = this.folderLocks.get(folderId) ?? Promise.resolve();
		const result = previous.then(work);
		const settled = result.catch(() => undefined);
		this.folderLocks.set(folderId, settled);
		void settled.then(() => {
			if (this.folderLocks.get(folderId) === settled) {
				this.folderLocks.delete(folderId);
			}
		});
		return await result;
	}

	public async add(entry: LedgerEntry): Promise<void> {
		const next = this.pending.then(async () => {
			const entries = await this.read();
			await writeFileAtomically(
				this.path,
				JSON.stringify({ entries: [...entries, entry] }),
			);
		});
		this.pending = next.catch(() => undefined);
		await next;
	}

	private async read(): Promise<LedgerEntry[]> {
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
		return contents === undefined ? [] : parseLedger(this.path, contents);
	}
}
