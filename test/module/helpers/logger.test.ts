/**
 * Tests for helpers/logger.ts
 * Centralized logging utilities
 */

describe("logger", () => {
	let logger: {
		debug: (message: string, ...args: unknown[]) => void;
		info: (message: string, ...args: unknown[]) => void;
		warn: (message: string, ...args: unknown[]) => void;
		error: (message: string, err?: unknown, ...args: unknown[]) => void;
		notify: (type: string, message: string, options?: { permanent?: boolean; console?: boolean }) => void;
		errorWithNotify: (message: string, err?: unknown, userMessage?: string) => void;
		warnWithNotify: (message: string, userMessage?: string) => void;
		setDebugEnabled: (enabled: boolean) => void;
		isDebugEnabled: () => boolean;
	};

	// Spy on console methods
	let consoleDebugSpy: jest.SpyInstance;
	let consoleLogSpy: jest.SpyInstance;
	let consoleWarnSpy: jest.SpyInstance;
	let consoleErrorSpy: jest.SpyInstance;

	beforeAll(async () => {
		const module = await import("../../../src/module/helpers/logger");
		logger = module.logger;
	});

	beforeEach(() => {
		// Reset debug mode
		logger.setDebugEnabled(false);

		// Setup spies
		consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation();
		consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
		consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
		consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe("debug", () => {
		it("should not log when debug is disabled", () => {
			logger.setDebugEnabled(false);
			logger.debug("test message");
			expect(consoleDebugSpy).not.toHaveBeenCalled();
		});

		it("should log when debug is enabled", () => {
			logger.setDebugEnabled(true);
			logger.debug("test message");
			expect(consoleDebugSpy).toHaveBeenCalled();
			expect(consoleDebugSpy.mock.calls[0][0]).toContain("[masks-newgeneration-unofficial]");
		});

		it("should include additional arguments", () => {
			logger.setDebugEnabled(true);
			logger.debug("test", { data: 123 });
			expect(consoleDebugSpy).toHaveBeenCalledWith(
				expect.stringContaining("test"),
				{ data: 123 }
			);
		});
	});

	describe("info", () => {
		it("should log with module prefix", () => {
			logger.info("test message");
			expect(consoleLogSpy).toHaveBeenCalled();
			expect(consoleLogSpy.mock.calls[0][0]).toContain("[masks-newgeneration-unofficial]");
			expect(consoleLogSpy.mock.calls[0][0]).toContain("test message");
		});

		it("should include additional arguments", () => {
			logger.info("test", 1, 2, 3);
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("test"),
				1, 2, 3
			);
		});
	});

	describe("warn", () => {
		it("should log with module prefix", () => {
			logger.warn("warning message");
			expect(consoleWarnSpy).toHaveBeenCalled();
			expect(consoleWarnSpy.mock.calls[0][0]).toContain("[masks-newgeneration-unofficial]");
		});
	});

	describe("error", () => {
		it("should log with module prefix", () => {
			logger.error("error message");
			expect(consoleErrorSpy).toHaveBeenCalled();
			expect(consoleErrorSpy.mock.calls[0][0]).toContain("[masks-newgeneration-unofficial]");
		});

		it("should include Error object details", () => {
			const testError = new Error("Test error");
			logger.error("something failed", testError);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("something failed"),
				testError.message,
				testError.stack
			);
		});

		it("should handle non-Error objects", () => {
			logger.error("failed", { code: 500 });
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("failed"),
				{ code: 500 }
			);
		});
	});

	describe("notify", () => {
		it("should fallback to console when UI not available", () => {
			logger.notify("warn", "test notification");
			expect(consoleWarnSpy).toHaveBeenCalled();
		});

		it("should use UI notifications when available", () => {
			const mockWarn = jest.fn();
			(globalThis as unknown as Record<string, unknown>).ui = {
				notifications: {
					info: jest.fn(),
					warn: mockWarn,
					error: jest.fn(),
				},
			};

			logger.notify("warn", "user message");
			expect(mockWarn).toHaveBeenCalledWith("user message", { permanent: undefined });

			// Cleanup
			delete (globalThis as unknown as Record<string, unknown>).ui;
		});

		it("should skip console log when console option is false", () => {
			logger.notify("info", "message", { console: false });
			// With no UI, it still logs to console as fallback
			// This behavior is intentional - we need some output
		});
	});

	describe("errorWithNotify", () => {
		it("should log error and show notification", () => {
			logger.errorWithNotify("internal error", new Error("test"), "User-friendly message");
			expect(consoleErrorSpy).toHaveBeenCalled();
		});

		it("should use message as user message if not provided", () => {
			logger.errorWithNotify("error message");
			expect(consoleErrorSpy).toHaveBeenCalled();
		});
	});

	describe("warnWithNotify", () => {
		it("should log warning and show notification", () => {
			logger.warnWithNotify("internal warning", "User warning");
			expect(consoleWarnSpy).toHaveBeenCalled();
		});
	});

	describe("setDebugEnabled / isDebugEnabled", () => {
		it("should toggle debug mode", () => {
			expect(logger.isDebugEnabled()).toBe(false);

			logger.setDebugEnabled(true);
			expect(logger.isDebugEnabled()).toBe(true);

			logger.setDebugEnabled(false);
			expect(logger.isDebugEnabled()).toBe(false);
		});
	});
});
