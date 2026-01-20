/**
 * InvocationRecorder - Tracks method calls for test assertions
 *
 * Usage:
 *   const recorder = new InvocationRecorder();
 *   recorder.record("methodName", [arg1, arg2]);
 *   expect(recorder.wasCalled("methodName")).toBe(true);
 *   expect(recorder.getInvocationsFor("methodName")[0].args).toEqual([arg1, arg2]);
 */

import type { Invocation, ITrackable } from "./interfaces";

export class InvocationRecorder implements ITrackable {
	private _invocations: Invocation[] = [];

	/**
	 * Record a method invocation
	 */
	record(method: string, args: unknown[] = []): void {
		this._invocations.push({
			method,
			args: Object.freeze([...args]),
			timestamp: Date.now(),
		});
	}

	/**
	 * Get all recorded invocations
	 */
	get invocations(): readonly Invocation[] {
		return Object.freeze([...this._invocations]);
	}

	/**
	 * Get invocations for a specific method
	 */
	getInvocationsFor(method: string): readonly Invocation[] {
		return Object.freeze(this._invocations.filter((inv) => inv.method === method));
	}

	/**
	 * Clear all recorded invocations
	 */
	clearInvocations(): void {
		this._invocations = [];
	}

	/**
	 * Check if a method was called
	 */
	wasCalled(method: string): boolean {
		return this._invocations.some((inv) => inv.method === method);
	}

	/**
	 * Get the number of times a method was called
	 */
	callCount(method: string): number {
		return this._invocations.filter((inv) => inv.method === method).length;
	}

	/**
	 * Get the last invocation for a method
	 */
	getLastInvocation(method: string): Invocation | undefined {
		const methodInvocations = this._invocations.filter((inv) => inv.method === method);
		return methodInvocations[methodInvocations.length - 1];
	}

	/**
	 * Get all unique methods that were called
	 */
	getCalledMethods(): string[] {
		return [...new Set(this._invocations.map((inv) => inv.method))];
	}

	/**
	 * Assert a method was called with specific arguments
	 * Returns true if any invocation matches
	 */
	wasCalledWith(method: string, ...expectedArgs: unknown[]): boolean {
		return this._invocations.some(
			(inv) =>
				inv.method === method &&
				inv.args.length === expectedArgs.length &&
				inv.args.every((arg, i) => this.deepEqual(arg, expectedArgs[i])),
		);
	}

	/**
	 * Assert a method was called with arguments matching a predicate
	 */
	wasCalledMatching(method: string, predicate: (args: readonly unknown[]) => boolean): boolean {
		return this._invocations.some((inv) => inv.method === method && predicate(inv.args));
	}

	/**
	 * Simple deep equality check for argument comparison
	 */
	private deepEqual(a: unknown, b: unknown): boolean {
		if (a === b) return true;
		if (typeof a !== typeof b) return false;
		if (typeof a !== "object" || a === null || b === null) return false;

		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		const aKeys = Object.keys(aObj);
		const bKeys = Object.keys(bObj);

		if (aKeys.length !== bKeys.length) return false;

		return aKeys.every((key) => this.deepEqual(aObj[key], bObj[key]));
	}
}
