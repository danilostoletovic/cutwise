import js from "@eslint/js";
import babel from "@babel/eslint-parser";
import hooks from "eslint-plugin-react-hooks";
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/ffmpeg/**",
      "artifacts/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.ts"],
    linterOptions: { reportUnusedDisableDirectives: false },
    languageOptions: {
      parser: babel,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          plugins: ["@babel/plugin-syntax-jsx"],
          presets: ["@babel/preset-typescript"],
        },
      },
    },
    plugins: { "react-hooks": hooks },
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
