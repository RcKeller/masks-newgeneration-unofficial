/**
 * Core interfaces for test stubs
 * Based on patterns from the Fabricate testing module
 */

/**
 * Represents a single method invocation with its arguments and timestamp
 */
export interface Invocation {
	readonly method: string;
	readonly args: readonly unknown[];
	readonly timestamp: number;
}

/**
 * Interface for stubs that track method invocations
 * Enables assertion on call history
 */
export interface ITrackable {
	/** All recorded invocations */
	readonly invocations: readonly Invocation[];

	/** Get invocations for a specific method */
	getInvocationsFor(method: string): readonly Invocation[];

	/** Clear all recorded invocations */
	clearInvocations(): void;

	/** Check if a method was called */
	wasCalled(method: string): boolean;

	/** Get the number of times a method was called */
	callCount(method: string): number;

	/** Get the last invocation for a method */
	getLastInvocation(method: string): Invocation | undefined;
}

/**
 * Interface for stubs that can inject errors
 * Enables testing error handling paths
 */
export interface IPoisonable<TKey = string> {
	/** Mark a method/key as poisoned - will throw on next access */
	poison(key: TKey, error?: Error): void;

	/** Remove poison from a method/key */
	cure(key: TKey): void;

	/** Check if a method/key is poisoned */
	isPoisoned(key: TKey): boolean;

	/** Remove all poisons */
	cureAll(): void;
}

/**
 * Interface for stubs that can save and restore state
 * Enables test isolation and state rollback
 */
export interface IRestorable<TState = unknown> {
	/** Save current state as a snapshot */
	save(): void;

	/** Reset to last saved snapshot */
	reset(): void;

	/** Reset to empty/initial state */
	resetToEmpty(): void;

	/** Get the current state (for debugging) */
	getCurrentState(): TState;
}

/**
 * Combined interface for fully-featured stubs
 */
export interface IFullStub<TState = unknown, TKey = string>
	extends ITrackable,
		IPoisonable<TKey>,
		IRestorable<TState> {}

/**
 * Type for stub factory configuration
 */
export interface StubConfig<T> {
	/** Default values for the stub */
	defaults?: Partial<T>;
	/** Whether to auto-save state on creation */
	autoSave?: boolean;
}
