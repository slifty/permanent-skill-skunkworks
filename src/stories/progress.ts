import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomically } from "../files.ts";
const progressFile = z.record(z.string(), z.string());

export const digestOf = (value: unknown): string =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");

const parseProgress = (
	contents: string | undefined,
): Record<string, string> => {
	if (contents === undefined) {
		return {};
	}
	try {
		const parsed = progressFile.safeParse(JSON.parse(contents));
		return parsed.success ? parsed.data : {};
	} catch (_error) {
		return {};
	}
};

export class StoryProgress {
	private readonly path: string;
	private pending: Promise<unknown> = Promise.resolve();

	public constructor(dataDirectory: string, environment: string) {
		this.path = join(dataDirectory, `story-progress.${environment}.json`);
	}

	public async isApplied(key: string, digest: string): Promise<boolean> {
		return (await this.read())[key] === digest;
	}

	public async markApplied(key: string, digest: string): Promise<void> {
		const next = this.pending.then(async () => {
			const entries = await this.read();
			await writeFileAtomically(
				this.path,
				JSON.stringify({ ...entries, [key]: digest }),
			);
		});
		this.pending = next.catch(() => undefined);
		await next;
	}

	private async read(): Promise<Record<string, string>> {
		return parseProgress(
			await readFile(this.path, "utf8").catch(() => undefined),
		);
	}
}
