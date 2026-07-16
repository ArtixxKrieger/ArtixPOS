import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierConfig from "eslint-config-prettier";
import reactHooksPlugin from "eslint-plugin-react-hooks";

// ── Shared base rules ─────────────────────────────────────────────────────────
const tsRules = {
  ...tsPlugin.configs["recommended"].rules,
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-require-imports": "warn",
  "no-console": "off",
  "no-debugger": "error",
};

export default [
  // ── Server + shared code: strict unused-vars (errors block CI) ─────────────
  {
    files: ["server/**/*.ts", "shared/**/*.ts", "script/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2020, sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...tsRules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },

  // ── Client code: warn on unused vars (rapid UI development has more churn) ──
  {
    files: ["client/src/**/*.ts", "client/src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2020, sourceType: "module" },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...tsRules,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // Hooks rules — rules-of-hooks is an error (real runtime bug); exhaustive-deps is a warning
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "off",
    },
  },

  prettierConfig,
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "android/**",
      "ios/**",
      "migrations/**",
      ".local/**",
      "script/build.js",
      "artifacts/**",
      "tests/**",
      "tailwind.config.ts",
      "capacitor.config.ts",
      "drizzle.config.ts",
      "*.cjs",
    ],
  },
];
