/**
 * Jest Setup File
 * Configures the test environment with FoundryVTT mocks
 *
 * This file provides both legacy mocks (for backward compatibility) and
 * the new stub-based testing infrastructure with invocation tracking,
 * state management, and error injection capabilities.
 *
 * New tests should prefer using the exported stub instances:
 *   import { notifications, settings, hooks } from "../setup";
 *   expect(notifications.hasNotification("warn", "message")).toBe(true);
 */

import { setupFoundryMocks as legacySetup, cleanupFoundryMocks } from "./__mocks__/foundry";

// New stub instances
import { StubNotificationService } from "./stubs/foundry/StubNotificationService";
import { StubLocalizationService } from "./stubs/foundry/StubLocalizationService";
import { StubSettings } from "./stubs/foundry/StubSettings";
import { StubHooks } from "./stubs/foundry/StubHooks";
import { StubChatMessage } from "./stubs/foundry/StubChatMessage";
import { StubActorCollection } from "./stubs/domain/StubActorCollection";

// ============================================================================
// Exported Stub Instances
// ============================================================================

/**
 * Stub for ui.notifications
 * Use for asserting on notification messages:
 *   expect(notifications.hasNotification("warn", "pattern")).toBe(true);
 *   expect(notifications.callCount("error")).toBe(0);
 */
export const notifications = new StubNotificationService();

/**
 * Stub for game.i18n
 * Pre-loaded with Masks translations, or add your own:
 *   i18n.addTranslation("KEY", "value");
 */
export const i18n = new StubLocalizationService().loadMasksTranslations();

/**
 * Stub for game.settings
 * Track setting registration and access:
 *   expect(settings.isRegistered("masks-newgeneration-unofficial", "darkMode")).toBe(true);
 */
export const settings = new StubSettings();

/**
 * Stub for global Hooks
 * Track hook registration and trigger hooks in tests:
 *   hooks.callAll("ready");
 *   expect(hooks.hasCallbacks("renderActorSheet")).toBe(true);
 */
export const hooks = new StubHooks();

/**
 * Stub for ChatMessage
 * Track chat message creation:
 *   expect(chatMessage.hasMessage("Team pool")).toBe(true);
 */
export const chatMessage = new StubChatMessage();

/**
 * Stub for game.actors collection
 * Add actors for tests:
 *   actorCollection.add(StubActor.forCharacter({ name: "Beacon" }));
 */
export const actorCollection = new StubActorCollection();

// ============================================================================
// Setup Functions
// ============================================================================

/**
 * Setup all Foundry mocks (legacy + new stubs)
 */
export function setupFoundryMocks(): void {
	// Run legacy setup first
	legacySetup();

	// Inject new stubs into global scope
	// These override the legacy mocks with trackable versions
	(globalThis as unknown as Record<string, unknown>).ui = {
		notifications,
	};
	(globalThis as unknown as Record<string, unknown>).Hooks = hooks;
	(globalThis as unknown as Record<string, unknown>).ChatMessage = chatMessage;

	// Extend game object with new stubs
	const game = (globalThis as unknown as Record<string, unknown>).game as Record<string, unknown>;
	game.i18n = i18n;
	game.settings = settings;
	game.actors = actorCollection;
}

/**
 * Reset all stub state between tests
 */
function resetStubs(): void {
	notifications.clearInvocations();
	notifications.clearNotifications();
	i18n.clearInvocations();
	settings.clearInvocations();
	settings.cureAll();
	hooks.clearInvocations();
	hooks.clearAll();
	chatMessage.clearInvocations();
	chatMessage.clearMessages();
	chatMessage.cureAll();
	actorCollection.clearInvocations();
	actorCollection.resetToEmpty();
}

// ============================================================================
// Jest Lifecycle Hooks
// ============================================================================

// Setup mocks before all tests
beforeAll(() => {
	setupFoundryMocks();
});

// Reset mocks before each test
beforeEach(() => {
	setupFoundryMocks();
	resetStubs();
});

// Cleanup after all tests
afterAll(() => {
	cleanupFoundryMocks();
});
