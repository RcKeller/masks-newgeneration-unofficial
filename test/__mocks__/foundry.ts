/**
 * FoundryVTT Mock Layer
 * Provides mock implementations of Foundry globals for testing
 */

// ============================================================================
// Core Utilities
// ============================================================================

export const mockDeepClone = <T>(obj: T): T => {
	if (obj === null || typeof obj !== "object") return obj;
	if (Array.isArray(obj)) return obj.map(mockDeepClone) as unknown as T;
	const result: Record<string, unknown> = {};
	for (const key of Object.keys(obj as Record<string, unknown>)) {
		result[key] = mockDeepClone((obj as Record<string, unknown>)[key]);
	}
	return result as T;
};

export const mockGetProperty = (obj: unknown, path: string): unknown => {
	if (!obj || typeof obj !== "object") return undefined;
	const parts = path.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined) return undefined;
		if (typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
};

export const mockSetProperty = (obj: unknown, path: string, value: unknown): boolean => {
	if (!obj || typeof obj !== "object") return false;
	const parts = path.split(".");
	let current: Record<string, unknown> = obj as Record<string, unknown>;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (!(part in current) || typeof current[part] !== "object") {
			current[part] = {};
		}
		current = current[part] as Record<string, unknown>;
	}
	current[parts[parts.length - 1]] = value;
	return true;
};

export const mockFlattenObject = (obj: Record<string, unknown>, prefix = ""): Record<string, unknown> => {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		const fullKey = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === "object" && !Array.isArray(value)) {
			Object.assign(result, mockFlattenObject(value as Record<string, unknown>, fullKey));
		} else {
			result[fullKey] = value;
		}
	}
	return result;
};

export const mockEscapeHTML = (str: string): string => {
	const map: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#039;",
	};
	return String(str ?? "").replace(/[&<>"']/g, (m) => map[m] || m);
};

export const mockRandomID = (length = 16): string => {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
};

// ============================================================================
// Mock foundry global
// ============================================================================

export const mockFoundry = {
	utils: {
		deepClone: mockDeepClone,
		getProperty: mockGetProperty,
		setProperty: mockSetProperty,
		flattenObject: mockFlattenObject,
		escapeHTML: mockEscapeHTML,
		randomID: mockRandomID,
	},
};

// ============================================================================
// Mock CONST
// ============================================================================

export const mockCONST = {
	DOCUMENT_OWNERSHIP_LEVELS: {
		NONE: 0,
		LIMITED: 1,
		OBSERVER: 2,
		OWNER: 3,
	},
	CHAT_MESSAGE_TYPES: {
		OTHER: 0,
		OOC: 1,
		IC: 2,
		EMOTE: 3,
		WHISPER: 4,
		ROLL: 5,
	},
};

// ============================================================================
// Mock UI
// ============================================================================

export const mockUI = {
	notifications: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
};

// ============================================================================
// Mock game
// ============================================================================

export interface MockUser {
	id: string;
	name: string;
	isGM: boolean;
	active: boolean;
}

export interface MockActorData {
	id: string;
	name: string;
	type: "character" | "npc";
	system: Record<string, unknown>;
	flags: Record<string, unknown>;
	getFlag: (namespace: string, key: string) => unknown;
	setFlag: (namespace: string, key: string, value: unknown) => Promise<void>;
}

export const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
	id: mockRandomID(),
	name: "Test User",
	isGM: false,
	active: true,
	...overrides,
});

export const createMockActor = (overrides: Partial<MockActorData> = {}): MockActorData => {
	const flags: Record<string, unknown> = overrides.flags ?? {};

	const actor: MockActorData = {
		id: mockRandomID(),
		name: "Test Character",
		type: "character",
		system: {
			stats: {
				danger: { value: 0, label: "Danger" },
				freak: { value: 0, label: "Freak" },
				savior: { value: 0, label: "Savior" },
				superior: { value: 0, label: "Superior" },
				mundane: { value: 0, label: "Mundane" },
			},
			attributes: {
				conditions: {
					options: {
						0: { value: false }, // Afraid
						1: { value: false }, // Angry
						2: { value: false }, // Guilty
						3: { value: false }, // Hopeless
						4: { value: false }, // Insecure
					},
				},
				hp: { value: 5, max: 5 },
				xp: { value: 0 },
				realName: { value: "" },
			},
			resources: {
				forward: { value: 0 },
				ongoing: { value: 0 },
			},
			playbook: { name: "" },
		},
		flags,
		getFlag(namespace: string, key: string): unknown {
			const nsFlags = this.flags[namespace] as Record<string, unknown> | undefined;
			return nsFlags?.[key];
		},
		setFlag: async function (namespace: string, key: string, value: unknown): Promise<void> {
			if (!this.flags[namespace]) {
				this.flags[namespace] = {};
			}
			(this.flags[namespace] as Record<string, unknown>)[key] = value;
		},
		...overrides,
	};

	// Re-apply getFlag/setFlag methods in case overrides clobbered them
	actor.getFlag = function (namespace: string, key: string): unknown {
		const nsFlags = this.flags[namespace] as Record<string, unknown> | undefined;
		return nsFlags?.[key];
	};
	actor.setFlag = async function (namespace: string, key: string, value: unknown): Promise<void> {
		if (!this.flags[namespace]) {
			this.flags[namespace] = {};
		}
		(this.flags[namespace] as Record<string, unknown>)[key] = value;
	};

	return actor;
};

export const createMockGame = (overrides: Partial<{
	user: MockUser;
	users: MockUser[];
	actors: MockActorData[];
}> = {}): {
	user: MockUser;
	users: { contents: MockUser[] };
	actors: { contents: MockActorData[] };
	i18n: { localize: (key: string) => string };
	pbta: { sheetConfig: unknown };
} => ({
	user: overrides.user ?? createMockUser({ isGM: true }),
	users: { contents: overrides.users ?? [createMockUser({ isGM: true })] },
	actors: { contents: overrides.actors ?? [] },
	i18n: { localize: (key: string) => key },
	pbta: { sheetConfig: {} },
});

// ============================================================================
// Mock Hooks
// ============================================================================

type HookCallback = (...args: unknown[]) => void;
const hookRegistry = new Map<string, Set<HookCallback>>();

export const mockHooks = {
	on: jest.fn((name: string, fn: HookCallback) => {
		if (!hookRegistry.has(name)) hookRegistry.set(name, new Set());
		hookRegistry.get(name)!.add(fn);
		return fn;
	}),
	once: jest.fn((name: string, fn: HookCallback) => {
		const wrapper = (...args: unknown[]) => {
			hookRegistry.get(name)?.delete(wrapper);
			fn(...args);
		};
		if (!hookRegistry.has(name)) hookRegistry.set(name, new Set());
		hookRegistry.get(name)!.add(wrapper);
		return wrapper;
	}),
	off: jest.fn((name: string, fn: HookCallback) => {
		hookRegistry.get(name)?.delete(fn);
	}),
	call: jest.fn((name: string, ...args: unknown[]) => {
		const hooks = hookRegistry.get(name);
		if (!hooks) return true;
		for (const fn of hooks) {
			const result = fn(...args);
			if (result === false) return false;
		}
		return true;
	}),
	callAll: jest.fn((name: string, ...args: unknown[]) => {
		const hooks = hookRegistry.get(name);
		if (!hooks) return;
		for (const fn of hooks) {
			fn(...args);
		}
	}),
	_reset: () => {
		hookRegistry.clear();
	},
};

// ============================================================================
// Mock Dialog
// ============================================================================

export const mockDialog = jest.fn().mockImplementation((config) => ({
	render: jest.fn(() => {
		// Auto-resolve with default behavior for tests
		if (config.close) config.close();
	}),
}));

// ============================================================================
// Mock ChatMessage
// ============================================================================

export const mockChatMessage = {
	create: jest.fn().mockResolvedValue({}),
};

// ============================================================================
// Mock canvas
// ============================================================================

export const mockCanvas = {
	tokens: {
		placeables: [] as unknown[],
	},
};

// ============================================================================
// Global Setup
// ============================================================================

export function setupFoundryMocks(): void {
	// Reset all mocks
	jest.clearAllMocks();
	mockHooks._reset();

	// Setup globals
	(globalThis as unknown as Record<string, unknown>).foundry = mockFoundry;
	(globalThis as unknown as Record<string, unknown>).CONST = mockCONST;
	(globalThis as unknown as Record<string, unknown>).ui = mockUI;
	(globalThis as unknown as Record<string, unknown>).Hooks = mockHooks;
	(globalThis as unknown as Record<string, unknown>).Dialog = mockDialog;
	(globalThis as unknown as Record<string, unknown>).ChatMessage = mockChatMessage;
	(globalThis as unknown as Record<string, unknown>).canvas = mockCanvas;
	(globalThis as unknown as Record<string, unknown>).game = createMockGame();
}

export function cleanupFoundryMocks(): void {
	delete (globalThis as unknown as Record<string, unknown>).foundry;
	delete (globalThis as unknown as Record<string, unknown>).CONST;
	delete (globalThis as unknown as Record<string, unknown>).ui;
	delete (globalThis as unknown as Record<string, unknown>).Hooks;
	delete (globalThis as unknown as Record<string, unknown>).Dialog;
	delete (globalThis as unknown as Record<string, unknown>).ChatMessage;
	delete (globalThis as unknown as Record<string, unknown>).canvas;
	delete (globalThis as unknown as Record<string, unknown>).game;
}
