// masks-newgeneration-unofficial / team.js
/* global game, ui, Hooks, ChatMessage, CONST, foundry, JournalEntry */

const NS = "masks-newgeneration-unofficial";

// Settings keys
const KEY_ALLOW_EDIT = "playersCanEdit"; // UI gate only (document permission is the real control)
const KEY_ANNOUNCE = "announceChanges";
const KEY_POSITION = "hudPosition"; // legacy: Team HUD is now on the Turn Cards "Team" card
// Used only to remember which Journal is our storage; value itself is *not* stored in settings.
const KEY_TEAM_DOCID = "teamDocId";

// Reference links (kept for potential future use)
const LINKS = [
	{
		uuid: "Compendium.masks-newgeneration-unofficial.moves.Item.x3abYvFtsiDsMNQa",
		label: "Enter Battle as a Team",
	},
	{
		uuid: "Compendium.masks-newgeneration-unofficial.moves.Item.H7mJLUYVlQ3ZPGHK",
		label: "Spending Team",
	},
	{
		uuid: "Compendium.masks-newgeneration-unofficial.moves.Item.QWsQGprpNFFJz9AP",
		label: "Spending Team Selfishly",
	},
];

// ---- Internal constants -----------------------------------------------------

const TEAM_DOC_NAME = "MASKS • Team Pool";
const FLAG_PATH = `${NS}.team`;
const FLAG_MARKER = `${NS}.isTeamDoc`; // to mark our doc
const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;

/**
 * Shared Team-pool service.
 * This replaces the old floating HUD and is consumed by the Turn Cards "Team" card.
 * Exported globally as `MasksTeam`.
 */
const MasksTeam = {
	_teamDoc: null,

	// ---------- Storage helpers -----------------------------------------------

	async _getTeamDoc({ createIfMissing = false } = {}) {
		// 1) Cached instance
		if (this._teamDoc && game.journal?.has(this._teamDoc.id))
			return this._teamDoc;

		// 2) Stored id
		const storedId = game.settings.get(NS, KEY_TEAM_DOCID);
		if (storedId) {
			const found = game.journal?.get(storedId);
			if (found) return (this._teamDoc = found);
		}

		// 3) Via flag or name
		const fromFlag = game.journal?.find(
			(j) => j.getFlag(NS, "isTeamDoc") === true
		);
		if (fromFlag) {
			await game.settings.set(NS, KEY_TEAM_DOCID, fromFlag.id);
			return (this._teamDoc = fromFlag);
		}

		const byName = game.journal?.find((j) => (j.name ?? "") === TEAM_DOC_NAME);
		if (byName) {
			// If it exists by name but isn't marked, mark it now (GM only)
			if (game.user.isGM && byName.getFlag(NS, "isTeamDoc") !== true) {
				await byName.setFlag(NS, "isTeamDoc", true);
			}
			await game.settings.set(NS, KEY_TEAM_DOCID, byName.id);
			return (this._teamDoc = byName);
		}

		// 4) Create if requested and GM
		if (createIfMissing && game.user.isGM) {
			const data = {
				name: TEAM_DOC_NAME,
				pages: [],
				ownership: { default: OWNER }, // all players are Owners of this doc
				flags: { [NS]: { isTeamDoc: true, team: 0 } },
			};
			const doc = await JournalEntry.create(data, { renderSheet: false });
			await game.settings.set(NS, KEY_TEAM_DOCID, doc.id);
			ui.notifications?.info?.(
				"Created Team Pool journal with Owner permission for all players."
			);
			return (this._teamDoc = doc);
		}

		return null;
	},

	async ensureReady() {
		// Called on ready for every user; GMs also ensure creation / migration.
		if (game.user.isGM) {
			const doc = await this._getTeamDoc({ createIfMissing: true });
			if (doc) {
				// Ensure Owner for all players
				const defaultPerm = doc.ownership?.default ?? 0;
				if (defaultPerm !== OWNER) {
					await doc.update({
						ownership: { ...(doc.ownership ?? {}), default: OWNER },
					});
				}

				// One-time migration from old world setting "teamPool" (if present)
				const oldSetting = Number(game.settings.get(NS, "teamPool") ?? NaN);
				const hasOld = Number.isFinite(oldSetting);
				const currentFlag = Number(doc.getFlag(NS, "team"));
				if (
					hasOld &&
					Number.isFinite(currentFlag) &&
					currentFlag === 0 &&
					oldSetting > 0
				) {
					await doc.setFlag(NS, "team", oldSetting);
					await game.settings.set(NS, "teamPool", 0);
					console.warn(
						`[${NS}] Migrated Team ${oldSetting} from world setting to JournalEntry flags.`
					);
				}

				this._teamDoc = doc;
			}
		} else {
			this._teamDoc = await this._getTeamDoc({ createIfMissing: false });
		}
	},

	_normalize(n) {
		const v = Number(n);
		return Math.max(0, Number.isFinite(v) ? Math.floor(v) : 0);
	},

	get value() {
		if (!this._teamDoc) return 0;
		const v = Number(this._teamDoc.getFlag(NS, "team"));
		return Number.isFinite(v) ? this._normalize(v) : 0;
	},

	get canEdit() {
		// UI gate: both the setting AND the document permission must allow
		const allowBySetting = game.settings.get(NS, KEY_ALLOW_EDIT);
		return !!allowBySetting && this._teamDoc?.isOwner === true;
	},

	async change(delta, { announce = true } = {}) {
		const current = this.value;
		return this.set(current + delta, { announce });
	},

	async set(n, { announce = true } = {}) {
		n = this._normalize(n);

		// Ensure we know the storage doc
		this._teamDoc ??= await this._getTeamDoc({ createIfMissing: false });
		if (!this._teamDoc) {
			ui.notifications?.warn?.(
				"Team Pool storage not initialized yet. A GM must open the world once."
			);
			return;
		}

		// UI gate + permission check
		if (!this.canEdit) {
			if (!game.settings.get(NS, KEY_ALLOW_EDIT)) {
				ui.notifications?.warn?.(
					"Players cannot edit the Team pool right now (disabled in settings)."
				);
			} else {
				ui.notifications?.warn?.("You don’t have permission to edit Team.");
			}
			return;
		}

		const old = this.value;
		if (n === old) return;

		try {
			await this._teamDoc.setFlag(NS, "team", n);

			// Notify any UIs that depend on Team
			Hooks.callAll("masksTeamUpdated", n, old);

			// Optional announce
			if (announce && game.settings.get(NS, KEY_ANNOUNCE)) {
				const d = n - old;
				const sign = d > 0 ? "+" : "";
				const from = game.user?.name ?? "Player";

				await ChatMessage.create({
					content: `<b>Team Pool</b>: ${old} → <b>${n}</b> (${sign}${d}) <span class="color-muted">— set by ${from}</span>`,
					type: CONST.CHAT_MESSAGE_TYPES.OTHER,
				});
			}
		} catch (err) {
			console.error(`[${NS}] Failed to set Team`, err);
			ui.notifications?.error?.("Couldn’t update the Team pool.");
		}
	},
};

// Expose globally so other modules (and the Turn Cards HUD) can use it.
globalThis.MasksTeam = MasksTeam;

// --------- Live sync: watch the storage doc directly -------------------------

Hooks.on("updateJournalEntry", (doc, changes) => {
	if (!MasksTeam._teamDoc || doc.id !== MasksTeam._teamDoc.id) return;

	// Only react if our flag changed or ownership changed (affects canEdit)
	const flagChanged =
		foundry.utils.getProperty(changes, `flags.${NS}.team`) !== undefined;
	const ownerChanged = changes.ownership !== undefined;

	if (flagChanged || ownerChanged) {
		// Refresh the cached doc reference
		MasksTeam._teamDoc = doc;
		Hooks.callAll("masksTeamUpdated", MasksTeam.value);
	}
});

Hooks.on("deleteJournalEntry", (doc) => {
	if (MasksTeam._teamDoc && doc.id === MasksTeam._teamDoc.id) {
		MasksTeam._teamDoc = null;
		Hooks.callAll("masksTeamUpdated", 0);
	}
});

// ----- Hooks & Settings ------------------------------------------------------

Hooks.once("init", () => {
	// (Legacy) world-shared Team pool value — retained only to migrate out of it.
	game.settings.register(NS, "teamPool", {
		name: "Team Pool (legacy)",
		hint:
			"Legacy storage used by older versions; automatically migrated to a shared JournalEntry.",
		scope: "world",
		config: false,
		type: Number,
		default: 0,
	});

	// World setting: can players edit? (UI gate only; real control is document permission)
	game.settings.register(NS, KEY_ALLOW_EDIT, {
		name: "Players can edit Team via the HUD",
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

	// Client setting: HUD position (now legacy, preserved so existing worlds don't error)
	game.settings.register(NS, KEY_POSITION, {
		name: "Team HUD Position (legacy)",
		hint:
			"Kept for backwards compatibility; the Team HUD now lives on the Turn Cards 'Team' card.",
		scope: "client",
		config: false,
		type: String,
		default: "top-right",
	});

	// World setting: remember our JournalEntry id
	game.settings.register(NS, KEY_TEAM_DOCID, {
		name: "Team Pool Journal Id",
		scope: "world",
		config: false,
		type: String,
		default: "",
	});
});

Hooks.once("ready", async () => {
	await MasksTeam.ensureReady();
});
