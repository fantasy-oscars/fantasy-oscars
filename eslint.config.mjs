import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      "no-console": "warn"
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "typeLike", format: ["PascalCase"] }
      ],
      "no-undef": "off"
    }
  },
  {
    files: ["apps/web/**/*.{tsx,jsx}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin
    },
    settings: {
      react: { version: "detect" }
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      // Design-system guardrail: Mantine must be accessed via `apps/web/src/ui/*`.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mantine/*"],
              message: "Import Mantine via apps/web/src/ui/* wrappers instead of @mantine/*."
            }
          ]
        }
      ]
    }
  },
  {
    // Allow direct Mantine imports inside the UI + theme layers (wrappers) and tests.
    files: [
      "apps/web/src/ui/**/*.{ts,tsx}",
      "apps/web/src/theme/**/*.{ts,tsx}",
      "apps/web/src/main.tsx",
      "apps/web/src/**/*.test.{ts,tsx}",
      "apps/web/src/**/__tests__/**/*.{ts,tsx}"
    ],
    rules: {
      "no-restricted-imports": "off"
    }
  },
  {
    // Scripts/tests commonly use console output intentionally; forbid inline suppressions
    // but allow console in these contexts to keep lint output clean.
    files: [
      "apps/api/scripts/**/*.{js,mjs,ts}",
      "apps/api/src/scripts/**/*.{ts,tsx}",
      "apps/api/test/**/*.{ts,tsx}",
      "apps/api/src/logger.ts",
      "apps/web/src/notifications/**/*.{ts,tsx}",
      "apps/web/src/vitest.setup.ts",
      "e2e/**/*.{ts,tsx}"
    ],
    rules: {
      "no-console": "off"
    }
  },
  {
    files: [".github/scripts/**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
        fetch: "readonly"
      }
    },
    rules: {
      "no-console": "off"
    }
  },
  {
    ignores: ["**/dist/**", "**/build/**", "**/node_modules/**"]
  }
];
