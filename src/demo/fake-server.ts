import { FakeArchive } from "../testing/fake-archive.ts";
import { fakeToken, startFakePermanent } from "../testing/fake-permanent.ts";

const DEFAULT_PORT = 8787;
const TOKEN_LIFETIME_SECONDS = 86_400;

const ACCOUNT = {
	email: "demo@permanent.test",
	password: "rehearsal",
	name: "Demo Member",
};

const main = async (): Promise<void> => {
	const port = Number(process.env.PORT ?? DEFAULT_PORT);
	const fake = await startFakePermanent(
		ACCOUNT,
		fakeToken(TOKEN_LIFETIME_SECONDS),
		port,
	);
	const archive = new FakeArchive();
	archive.install(fake);
	const webUrl = fake.apiUrl.replace(/\/api$/v, "");
	process.stdout.write(
		[
			"A fake Permanent is running. It keeps everything in memory and stops with Ctrl-C.",
			"",
			"Point the plugin at it with:",
			`  export PERMANENT_API_URL=${fake.apiUrl}`,
			`  export PERMANENT_STELA_URL=${fake.stelaUrl}`,
			`  export PERMANENT_WEB_URL=${webUrl}`,
			"",
			`Sign in as ${ACCOUNT.email} with the password "${ACCOUNT.password}".`,
			"",
		].join("\n"),
	);
	const report = (): void => {
		const folders = [...archive.folders.values()].filter(
			(folder) => folder.folderId > 4,
		);
		process.stdout.write(
			`\nArchive now holds ${folders.length} new folders and ${archive.records.size} files.\n`,
		);
		for (const folder of folders) {
			const files = archive.recordsIn(folder.folderId);
			process.stdout.write(
				`  ${folder.displayName} (${files.length} files)${folder.description === null ? "" : `: ${folder.description.slice(0, 60)}`}\n`,
			);
		}
		process.exit(0);
	};
	process.on("SIGINT", report);
	process.on("SIGTERM", report);
};

await main();
