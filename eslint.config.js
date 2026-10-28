import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
	{ ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/'] },
	{
		files: ['**/*.ts'],
		extends: [tseslint.configs.recommendedTypeChecked],
		languageOptions: {
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/consistent-type-imports': 'error',
		},
	},
	{
		// The harness page is plain browser JS.
		files: ['harness/**/*.js'],
		extends: [tseslint.configs.recommended],
	},
);
