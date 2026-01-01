import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    },
    rules: {
      "no-console": "warn"
    }
  },
  {
    ignores: ["**/dist/**", "**/build/**", "**/node_modules/**"]
  }
];

