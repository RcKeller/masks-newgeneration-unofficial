/**
 * FoundryVTT API Stubs
 * Re-exports all Foundry-related stubs for testing
 */

export { StubActor } from "./StubActor";
export type { ActorState, ActorSystemData } from "./StubActor";

export { StubNotificationService } from "./StubNotificationService";
export type { NotificationOptions, NotificationRecord } from "./StubNotificationService";

export { StubLocalizationService } from "./StubLocalizationService";

export { StubSettings } from "./StubSettings";
export type { SettingConfig } from "./StubSettings";

export { StubHooks } from "./StubHooks";

export { StubChatMessage } from "./StubChatMessage";
export type { ChatMessageData, CreatedMessage } from "./StubChatMessage";
