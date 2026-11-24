import { defineConfig, globalIgnores } from "eslint/config";
import typescriptEslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import js from "@eslint/js";
import love from "eslint-config-love";

export default defineConfig([
	globalIgnores(["plugins/permanent/server/", "node_modules/", "coverage/"]),
	{
		files: ["**/*.ts"],
		extends: [
			js.configs.recommended,
			typescriptEslint.configs.eslintRecommended,
			typescriptEslint.configs.recommendedTypeChecked,
			typescriptEslint.configs.strict,
			love,
			prettier,
		],
		languageOptions: {
			globals: globals.node,
			parserOptions: {
				projectService: true,
			},
		},
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
				},
			],
		},
	},
	{
		files: ["**/*.test.ts"],
		rules: {
			"max-lines": "off",
			"@typescript-eslint/no-magic-numbers": "off",
		},
	},
	{
		files: ["**/*.mjs"],
		extends: [js.configs.recommended, prettier],
		languageOptions: { globals: globals.node },
	},
]);
