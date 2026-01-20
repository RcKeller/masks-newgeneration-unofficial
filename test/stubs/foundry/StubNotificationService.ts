/**
 * StubNotificationService - Stub for FoundryVTT's ui.notifications
 *
 * Usage:
 *   const notifications = new StubNotificationService();
 *   (globalThis as any).ui = { notifications };
 *
 *   // In code under test:
 *   ui.notifications.warn("Something happened");
 *
 *   // In assertions:
 *   expect(notifications.wasCalled("warn")).toBe(true);
 *   expect(notifications.hasNotification("warn", "Something")).toBe(true);
 */

import { InvocationRecorder } from "../core/InvocationRecorder";
import type { ITrackable, Invocation } from "../core/interfaces";

export interface NotificationOptions {
	permanent?: boolean;
	localize?: boolean;
	console?: boolean;
}

export interface NotificationRecord {
	level: "info" | "warn" | "error";
	message: string;
	options?: NotificationOptions;
}

export class StubNotificationService implements ITrackable {
	private _recorder = new InvocationRecorder();
	private _notifications: NotificationRecord[] = [];

	/**
	 * Display an info notification
	 */
	info(message: string, options?: NotificationOptions): void {
		this._recorder.record("info", [message, options]);
		this._notifications.push({ level: "info", message, options });
	}

	/**
	 * Display a warning notification
	 */
	warn(message: string, options?: NotificationOptions): void {
		this._recorder.record("warn", [message, options]);
		this._notifications.push({ level: "warn", message, options });
	}

	/**
	 * Display an error notification
	 */
	error(message: string, options?: NotificationOptions): void {
		this._recorder.record("error", [message, options]);
		this._notifications.push({ level: "error", message, options });
	}

	// ========================================================================
	// Assertion Helpers
	// ========================================================================

	/**
	 * Check if a notification was shown matching pattern
	 */
	hasNotification(level: "info" | "warn" | "error", pattern: string | RegExp): boolean {
		return this._notifications.some((n) => {
			if (n.level !== level) return false;
			if (typeof pattern === "string") {
				return n.message.includes(pattern);
			}
			return pattern.test(n.message);
		});
	}

	/**
	 * Get all notifications of a specific level
	 */
	getNotifications(level?: "info" | "warn" | "error"): NotificationRecord[] {
		if (!level) return [...this._notifications];
		return this._notifications.filter((n) => n.level === level);
	}

	/**
	 * Get the last notification
	 */
	getLastNotification(): NotificationRecord | undefined {
		return this._notifications[this._notifications.length - 1];
	}

	/**
	 * Clear all recorded notifications
	 */
	clearNotifications(): void {
		this._notifications = [];
	}

	// ========================================================================
	// ITrackable Implementation
	// ========================================================================

	get invocations(): readonly Invocation[] {
		return this._recorder.invocations;
	}

	getInvocationsFor(method: string): readonly Invocation[] {
		return this._recorder.getInvocationsFor(method);
	}

	clearInvocations(): void {
		this._recorder.clearInvocations();
		this.clearNotifications();
	}

	wasCalled(method: string): boolean {
		return this._recorder.wasCalled(method);
	}

	callCount(method: string): number {
		return this._recorder.callCount(method);
	}

	getLastInvocation(method: string): Invocation | undefined {
		return this._recorder.getLastInvocation(method);
	}
}
