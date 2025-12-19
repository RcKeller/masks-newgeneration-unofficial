import js from "@eslint/js";
import * as importX from "eslint-plugin-import-x";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default [
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    importX.flatConfigs.recommended, // use import-x instead of import
    {
        files: ["**/*.{ts,tsx,js,jsx}"],
        ignores: ["dist", "node_modules"],
        languageOptions: {
            ecmaVersion: 2023,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                window: "readonly",
                document: "readonly",
                navigator: "readonly",
            },
        },
        plugins: {
            react,
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            ...react.configs.recommended.rules,
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": [
                "warn",
                { allowConstantExport: true },
            ],
        },
        settings: {
            react: { version: "detect" },
            "import-x/resolver": "typescript",
        },
    },
];
