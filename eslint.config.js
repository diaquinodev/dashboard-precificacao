import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "e2e/screenshots/"] },
  js.configs.recommended,
  {
    files: ["src/engine/**/*.js", "test/**/*.js", "e2e/**/*.js", "scripts/**/*.js", "*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/ui/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    // page.evaluate roda dentro do navegador
    files: ["e2e/**/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      eqeqeq: "error",
    },
  },
];
