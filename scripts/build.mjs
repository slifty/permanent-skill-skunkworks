import { build } from "esbuild";

await build({
	entryPoints: ["src/index.ts"],
	outfile: "plugins/permanent/server/index.js",
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	banner: {
		js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
	},
	legalComments: "eof",
	logLevel: "info",
});
