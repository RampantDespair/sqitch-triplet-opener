// @ts-check

import importPlugin from "eslint-plugin-import";
import nodePlugin from "eslint-plugin-n";
import perfectionistPlugin from "eslint-plugin-perfectionist";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  // Global ignores (replacement for .eslintignore)
  globalIgnores([
    ".vscode",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
  ]),

  // Configs
  tseslint.configs.recommended,

  importPlugin.flatConfigs.recommended,
  nodePlugin.configs["flat/recommended"],
  perfectionistPlugin.configs["recommended-alphabetical"],

  // Options
  {
    // include patterns
    files: ["**/*.{js,ts,mjs,mts,cjs,cts,jsx,tsx}"],
    // options
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
      sourceType: "module",
    },
  },
);
