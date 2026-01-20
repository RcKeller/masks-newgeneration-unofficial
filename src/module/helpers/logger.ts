/**
 * Centralized Logger
 * Standardized logging and notification utilities for the Masks module
 */

import { MODULE_ID } from "../constants";

/** Log levels */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Notification types */
export type NotificationType = "info" | "warn" | "error";

/** Logger configuration */
interface LoggerConfig {
	/** Whether debug logging is enabled (can be toggled via setting) */
	debugEnabled: boolean;
}

const config: LoggerConfig = {
	debugEnabled: false,
};

/**
 * Format a log message with module prefix
 */
function formatMessage(message: string): string {
	return `[${MODULE_ID}] ${message}`;
}

/**
 * Log a debug message (only when debug mode is enabled)
 */
export function debug(message: string, ...args: unknown[]): void {
	if (!config.debugEnabled) return;
	console.debug(formatMessage(message), ...args);
}

/**
 * Log an info message
 */
export function info(message: string, ...args: unknown[]): void {
	console.log(formatMessage(message), ...args);
}

/**
 * Log a warning message
 */
export function warn(message: string, ...args: unknown[]): void {
	console.warn(formatMessage(message), ...args);
}

/**
 * Log an error message
 */
export function error(message: string, err?: Error | unknown, ...args: unknown[]): void {
	if (err instanceof Error) {
		console.error(formatMessage(message), err.message, err.stack, ...args);
	} else if (err !== undefined) {
		console.error(formatMessage(message), err, ...args);
	} else {
		console.error(formatMessage(message), ...args);
	}
}

/**
 * Show a Foundry UI notification to the user
 * @param type - The notification type (info, warn, error)
 * @param message - The message to display
 * @param options - Optional notification options
 */
export function notify(
	type: NotificationType,
	message: string,
	options: { permanent?: boolean; console?: boolean } = {}
): void {
	const ui = (globalThis as unknown as { ui?: { notifications?: { info: Function; warn: Function; error: Function } } }).ui;

	if (!ui?.notifications) {
		// Fallback to console if UI not available
		console[type](formatMessage(message));
		return;
	}

	const notifyFn = ui.notifications[type];
	if (typeof notifyFn === "function") {
		notifyFn.call(ui.notifications, message, { permanent: options.permanent });
	}

	// Optionally also log to console
	if (options.console !== false) {
		console[type](formatMessage(message));
	}
}

/**
 * Log an error and show a user notification
 * Combines error logging with user feedback
 */
export function errorWithNotify(
	message: string,
	err?: Error | unknown,
	userMessage?: string
): void {
	error(message, err);
	notify("error", userMessage ?? message);
}

/**
 * Log a warning and show a user notification
 * Combines warning logging with user feedback
 */
export function warnWithNotify(
	message: string,
	userMessage?: string
): void {
	warn(message);
	notify("warn", userMessage ?? message);
}

/**
 * Enable or disable debug logging
 */
export function setDebugEnabled(enabled: boolean): void {
	config.debugEnabled = enabled;
}

/**
 * Check if debug logging is enabled
 */
export function isDebugEnabled(): boolean {
	return config.debugEnabled;
}

/**
 * Logger namespace object for convenience
 */
export const logger = {
	debug,
	info,
	warn,
	error,
	notify,
	errorWithNotify,
	warnWithNotify,
	setDebugEnabled,
	isDebugEnabled,
};

export default logger;
