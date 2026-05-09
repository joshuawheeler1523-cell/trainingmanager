import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
// eslint-plugin-tailwindcss v3 doesn't support Tailwind v4 CSS config yet.
// Re-enable once https://github.com/francoismassart/eslint-plugin-tailwindcss/issues/XXX ships.
import tailwindPlugin from "eslint-plugin-tailwindcss";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "packages/db/**",
      "scripts/**",
      "**/supabase/database.types.ts",
      "**/lib/supabase/database.types.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      tailwindcss: tailwindPlugin,
    },
    rules: {
      ...tsPlugin.configs["strict-type-checked"].rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      // tailwindcss rules disabled until plugin supports Tailwind v4
      ...Object.fromEntries(
        Object.keys(tailwindPlugin.configs.recommended.rules ?? {}).map((k) => [k, "off"]),
      ),
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
    settings: {
      react: { version: "detect" },
    },
  },
];
