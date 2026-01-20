import type { Config } from "jest";

const config: Config = {
	preset: "ts-jest",
	testEnvironment: "node",
	testMatch: ["**/test/**/*.test.ts"],

	// Transform TypeScript files
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				tsconfig: {
					module: "commonjs",
					moduleResolution: "node",
					esModuleInterop: true,
					allowSyntheticDefaultImports: true,
					strict: true,
					skipLibCheck: true,
					noEmit: true,
					isolatedModules: true,
				},
			},
		],
	},

	// Setup files run after Jest environment is set up
	setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],

	// Module path aliases
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/src/$1",
		"^@test/(.*)$": "<rootDir>/test/$1",
	},

	// Files to collect coverage from
	collectCoverageFrom: [
		"src/module/**/*.ts",
		"!src/module/types/**",
		"!src/**/*.d.ts",
	],

	// Coverage thresholds - start at 50% for pure functions, increase over time
	coverageThreshold: {
		global: {
			branches: 30,
			functions: 30,
			lines: 30,
			statements: 30,
		},
		// Higher thresholds for pure function files
		"src/module/labels-graph.ts": {
			branches: 50,
			functions: 50,
			lines: 50,
			statements: 50,
		},
		"src/module/health.ts": {
			branches: 40,
			functions: 40,
			lines: 40,
			statements: 40,
		},
	},

	// Coverage reporters
	coverageReporters: ["text", "text-summary", "lcov"],

	// Ignore patterns
	testPathIgnorePatterns: ["/node_modules/", "/dist/"],
	modulePathIgnorePatterns: ["/dist/"],

	// Clear mocks between tests
	clearMocks: true,
	restoreMocks: true,

	// Verbose output for debugging
	verbose: true,
};

export default config;
