// module/team.mjs
/* global game, Hooks */

/**
 * team.mjs - Team Pool Storage
 *
 * This module now primarily handles settings registration and storage.
 * The actual UI is provided by turn-cards.mjs when there's an active combat.
 * A minimal standalone HUD is shown only when NO combat is active.
 */

const NS = "masks-newgeneration-unofficial";

// Settings keys
const KEY_ALLOW_EDIT = "playersCanEdit";
const KEY_ANNOUNCE = "announceChanges";
const KEY_TEAM_DOCID = "teamDocId";

Hooks.once("init", () => {
	// Legacy storage - retained for migration
	game.settings.register(NS, "teamPool", {
		name: "Team Pool (legacy)",
		hint: "Legacy storage - migrated to JournalEntry.",
		scope: "world",
		config: false,
		type: Number,
		default: 0,
	});

	// World setting: can players edit?
	game.settings.register(NS, KEY_ALLOW_EDIT, {
		name: "Players can edit Team",
		hint: "Allow players to modify the Team pool.",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		onChange: () => Hooks.callAll("masksTeamConfigChanged"),
	});

	// World setting: announce to chat
	game.settings.register(NS, KEY_ANNOUNCE, {
		name: "Announce Team changes to chat",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
	});

	// World setting: remember JournalEntry id
	game.settings.register(NS, KEY_TEAM_DOCID, {
		name: "Team Pool Journal Id",
		scope: "world",
		config: false,
		type: String,
		default: "",
	});
});

// Note: The MasksTeam global is now exposed by turn-cards.mjs
// which handles all team pool functionality
