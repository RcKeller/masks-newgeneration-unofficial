/**
 * StubChatMessage - Stub for FoundryVTT's ChatMessage class
 *
 * Usage:
 *   const chatMessage = new StubChatMessage();
 *   globalThis.ChatMessage = chatMessage;
 *
 *   // In code under test:
 *   await ChatMessage.create({ content: "Hello" });
 *
 *   // In assertions:
 *   expect(chatMessage.getMessages()).toHaveLength(1);
 *   expect(chatMessage.hasMessage("Hello")).toBe(true);
 */

import { InvocationRecorder } from "../core/InvocationRecorder";
import { PoisonManager } from "../core/PoisonManager";
import type { ITrackable, IPoisonable, Invocation } from "../core/interfaces";

export interface ChatMessageData {
	id?: string;
	content?: string;
	speaker?: {
		actor?: string;
		alias?: string;
		scene?: string;
		token?: string;
	};
	type?: number;
	whisper?: string[];
	blind?: boolean;
	rolls?: unknown[];
	sound?: string;
	flags?: Record<string, unknown>;
}

export interface CreatedMessage extends ChatMessageData {
	id: string;
	timestamp: number;
}

export class StubChatMessage implements ITrackable, IPoisonable<string> {
	private _recorder = new InvocationRecorder();
	private _poison = new PoisonManager<string>();
	private _messages: CreatedMessage[] = [];
	private _nextId = 1;

	/**
	 * Create a new chat message
	 */
	async create(
		data: ChatMessageData | ChatMessageData[],
		_options?: { temporary?: boolean; renderSheet?: boolean },
	): Promise<CreatedMessage | CreatedMessage[]> {
		this._recorder.record("create", [data, _options]);
		this._poison.throwIfPoisoned("create");

		if (Array.isArray(data)) {
			return data.map((d) => this._createOne(d));
		}
		return this._createOne(data);
	}

	private _createOne(data: ChatMessageData): CreatedMessage {
		const message: CreatedMessage = {
			...data,
			id: data.id ?? `msg-${this._nextId++}`,
			timestamp: Date.now(),
		};
		this._messages.push(message);
		return message;
	}

	// ========================================================================
	// Test Helpers
	// ========================================================================

	/**
	 * Get all created messages
	 */
	getMessages(): CreatedMessage[] {
		return [...this._messages];
	}

	/**
	 * Get the last created message
	 */
	getLastMessage(): CreatedMessage | undefined {
		return this._messages[this._messages.length - 1];
	}

	/**
	 * Check if a message was created with matching content
	 */
	hasMessage(pattern: string | RegExp): boolean {
		return this._messages.some((m) => {
			if (!m.content) return false;
			if (typeof pattern === "string") {
				return m.content.includes(pattern);
			}
			return pattern.test(m.content);
		});
	}

	/**
	 * Get messages matching a pattern
	 */
	findMessages(pattern: string | RegExp): CreatedMessage[] {
		return this._messages.filter((m) => {
			if (!m.content) return false;
			if (typeof pattern === "string") {
				return m.content.includes(pattern);
			}
			return pattern.test(m.content);
		});
	}

	/**
	 * Get messages from a specific speaker
	 */
	getMessagesFromSpeaker(actorId: string): CreatedMessage[] {
		return this._messages.filter((m) => m.speaker?.actor === actorId);
	}

	/**
	 * Clear all messages
	 */
	clearMessages(): void {
		this._messages = [];
		this._nextId = 1;
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

	// ========================================================================
	// IPoisonable Implementation
	// ========================================================================

	poison(key: string, error?: Error): void {
		this._poison.poison(key, error);
	}

	cure(key: string): void {
		this._poison.cure(key);
	}

	isPoisoned(key: string): boolean {
		return this._poison.isPoisoned(key);
	}

	cureAll(): void {
		this._poison.cureAll();
	}
}
