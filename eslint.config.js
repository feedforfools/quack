import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

/**
 * Flat ESLint config for Quack.
 *
 * Stylistic rules are deferred to Prettier (see `eslint-config-prettier` last).
 * `typescript-eslint` recommended set + React + a11y are the substantive layer.
 */
export default tseslint.config(
  {
    ignores: ["dist", "node_modules", "coverage", "supabase/.branches"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // React 17+ JSX transform — no need to import React in scope.
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      // Project convention: rely on TS for prop types.
      "react/prop-types": "off",
      // Allow unused args prefixed with _ (typed callbacks).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Node-context config files.
  {
    files: ["*.config.{js,ts}", "postcss.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Prettier compatibility — must be last.
  prettier,
);
