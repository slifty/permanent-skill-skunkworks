import { execFileSync } from "node:child_process";

const BUNDLE_DIRECTORY = "plugins/permanent/server";

const changes = execFileSync(
	"git",
	["status", "--porcelain", "--untracked-files=all", "--", BUNDLE_DIRECTORY],
	{ encoding: "utf8" },
);

if (changes.trim() !== "") {
	console.error(
		`The committed bundle in ${BUNDLE_DIRECTORY} does not match the source. Run \`npm run build\` and commit the result.\n${changes}`,
	);
	process.exit(1);
}
