import js from "@eslint/js";
import * as importX from "eslint-plugin-import-x";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default [
    {
        ignores: [
            "dist/**",
            "node_modules/**",
            "coverage/**",
            "scripts/**",
            "tools/**",
            "test/**",
            ".github/**",
            "*.config.*",
            "*.cjs",
            "*.mjs",
            "*.mts",
            // TypeScript declaration files: handled by TypeScript compiler, not ESLint
            "**/*.d.ts",
            // Legacy entry point not in tsconfig
            "src/index.js",
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    importX.flatConfigs.recommended, // use import-x instead of import
    {
        files: ["**/*.{ts,tsx,js,jsx}"],
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

            // FoundryVTT APIs return `any` extensively via fvtt-types.
            // These rules produce thousands of unfixable errors — turn them off.
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-explicit-any": "warn",

            // Allow underscore-prefixed variables to be unused (conventional ignore pattern).
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],

            // import-x TypeScript resolver has an incompatible interface with
            // the installed version — disable resolver-dependent rules.
            "import-x/no-unresolved": "off",
            "import-x/namespace": "off",
            "import-x/named": "off",
            "import-x/default": "off",

            // jQuery and FoundryVTT event handlers commonly use async callbacks.
            // The void-returning event listener pattern is standard in this codebase.
            "@typescript-eslint/no-misused-promises": [
                "error",
                {
                    checksVoidReturn: {
                        attributes: false,
                        arguments: false,
                    },
                },
            ],
        },
        settings: {
            react: { version: "detect" },
            "import-x/resolver": "typescript",
        },
    },
];
