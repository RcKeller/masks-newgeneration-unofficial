/**
 * Jest Setup File for Masks Module
 * Uses shared test infrastructure from @rckeller/foundryvtt-devtools
 */

// Re-export everything from the shared package
export {
	setupFoundryMocks,
	cleanupFoundryMocks,
	resetStubs,
	notifications,
	settings,
	hooks,
	chatMessage,
	actorCollection,
} from "@rckeller/foundryvtt-devtools/jest";

// Import the base i18n and add Masks-specific translations
import { i18n as baseI18n } from "@rckeller/foundryvtt-devtools/jest";

// Load Masks-specific translations
export const i18n = baseI18n.addTranslations({
	"DISPATCH.Labels.Danger": "Danger",
	"DISPATCH.Labels.Freak": "Freak",
	"DISPATCH.Labels.Savior": "Savior",
	"DISPATCH.Labels.Superior": "Superior",
	"DISPATCH.Labels.Mundane": "Mundane",
	"DISPATCH.Labels.Soldier": "Soldier",
	"DISPATCH.Conditions.Afraid": "Afraid",
	"DISPATCH.Conditions.Angry": "Angry",
	"DISPATCH.Conditions.Guilty": "Guilty",
	"DISPATCH.Conditions.Hopeless": "Hopeless",
	"DISPATCH.Conditions.Insecure": "Insecure",
});

// Import setup to trigger Jest lifecycle hooks
import "@rckeller/foundryvtt-devtools/jest/setup";
