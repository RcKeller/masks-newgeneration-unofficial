/* global game, ui, Hooks, foundry, renderTemplate */

/**
 * turn-hud.mjs
 * ----------------------------------------------------------------------------
 * Team Turn Cards HUD (Foundry v13+)
 * - Renders character Actor cards from the *active* Combat encounter.
 * - Cooldown logic: when an actor takes a turn, they get a cooldown of (teamSize-1).
 *   Each subsequent "turn taken" (by another hero OR GM-turn card) decrements all
 *   other heroes' cooldown remaining by 1 (to a minimum of 0).
 * - Click card: open actor sheet
 * - Click star: +1 Potential (system.attributes.xp.value), clamped 0–5
 * - GM-only: per-card "MARK TURN TAKEN" + GM-only "GM" card which advances cooldowns.
 */

const NS = "masks-newgeneration-unofficial";
const TEMPLATE = `modules/${NS}/templates/turn-hud.hbs`;
const FLAG_KEY = "turnHud"; // stored on Combat: flags[NS].turnHud

function clampInt(n, lo, hi) {
	const x = Math.floor(Number(n));
	if (!Number.isFinite(x)) return lo;
	return Math.min(hi, Math.max(lo, x));
}

function getActiveCombat() {
	return game.combats?.active ?? null;
}

const MasksTurnHUD = {
	root: null,
	_renderQueued: false,
	_bound: false,
	_actorCache: new Map(), // actorId -> Actor (from the last render pass)

	_mountPoint() {
		return (
			document.querySelector("#ui-middle #ui-bottom") ||
			document.getElementById("ui-bottom") ||
			document.body
		);
	},

	async mount() {
		// Remove any prior instance (hot-reload safe-ish)
		try {
			this.root?.remove?.();
		} catch (_) {}
		this._actorCache.clear();

		this.root = document.createElement("section");
		this.root.id = "masks-turn-hud";
		this._mountPoint().appendChild(this.root);

		this._activateListeners();
		this._registerHooks();
		await this.render();
	},

	_registerHooks() {
		// Combat changes
		Hooks.on("createCombat", () => this._queueRender());
		Hooks.on("deleteCombat", () => this._queueRender());
		Hooks.on("updateCombat", () => this._queueRender());

		Hooks.on("createCombatant", () => this._queueRender());
		Hooks.on("deleteCombatant", () => this._queueRender());
		Hooks.on("updateCombatant", () => this._queueRender());

		// Scene/canvas swap can change token actors & combat visibility
		Hooks.on("canvasReady", () => this._queueRender());

		// Actor updates that matter for displayed cards (hp, xp, name, img)
		Hooks.on("updateActor", (actor, changes) => {
			if (!actor || actor.type !== "character") return;
			if (!this._isActorInActiveCombat(actor.id)) return;

			// Filter for likely-relevant paths (keep cheap and safe)
			const flat = foundry.utils.flattenObject(changes || {});
			const relevant =
				flat.name !== undefined ||
				flat.img !== undefined ||
				flat["system.attributes.hp.value"] !== undefined ||
				flat["system.attributes.xp.value"] !== undefined;

			if (relevant) this._queueRender();
		});
	},

	_queueRender() {
		if (this._renderQueued) return;
		this._renderQueued = true;
		setTimeout(async () => {
			this._renderQueued = false;
			await this.render();
		}, 15);
	},

	_readState(combat) {
		const raw = combat?.getFlag?.(NS, FLAG_KEY) ?? null;
		const cooldowns =
			raw && typeof raw.cooldowns === "object" && raw.cooldowns
				? raw.cooldowns
				: {};
		// Clone so we can safely normalize without mutating the flag object directly
		return {
			v: 1,
			cooldowns: foundry.utils.deepClone(cooldowns),
		};
	},

	_normalizeStateForTeam(state, teamIdsSet) {
		const cooldowns = state.cooldowns ?? (state.cooldowns = {});
		for (const [id, cd] of Object.entries(cooldowns)) {
			if (!teamIdsSet.has(id)) {
				delete cooldowns[id];
				continue;
			}
			const total = clampInt(cd?.total, 0, 999);
			const remaining = clampInt(cd?.remaining, 0, 999);
			if (total <= 0 || remaining <= 0) {
				delete cooldowns[id];
				continue;
			}
			cooldowns[id] = { total, remaining };
		}
		return state;
	},

	_getTeamActors(combat) {
		const map = new Map(); // actorId -> Actor
		const combatants = [...(combat?.combatants?.contents ?? [])]
			.filter((c) => c?.actor && c.actor.type === "character")
			.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

		for (const cbt of combatants) {
			const a = cbt.actor;
			if (!a) continue;
			if (!map.has(a.id)) map.set(a.id, a);
		}
		return [...map.values()];
	},

	_isActorInActiveCombat(actorId) {
		const combat = getActiveCombat();
		if (!combat || !actorId) return false;
		return (combat.combatants?.contents ?? []).some(
			(c) => c?.actor?.id === actorId && c.actor?.type === "character"
		);
	},

	_getActor(actorId) {
		return this._actorCache.get(actorId) || game.actors?.get(actorId) || null;
	},

	async render() {
		if (!this.root) return;

		const combat = getActiveCombat();
		if (!combat) {
			this.root.innerHTML = "";
			this.root.classList.add("is-hidden");
			this._actorCache.clear();
			return;
		}

		const teamActors = this._getTeamActors(combat);
		if (!teamActors.length) {
			this.root.innerHTML = "";
			this.root.classList.add("is-hidden");
			this._actorCache.clear();
			return;
		}

		// Refresh actor cache used by click handlers
		this._actorCache = new Map(teamActors.map((a) => [a.id, a]));

		const teamIds = new Set(teamActors.map((a) => a.id));
		const state = this._normalizeStateForTeam(this._readState(combat), teamIds);
		const cooldowns = state.cooldowns ?? {};

		const cards = teamActors.map((actor) => {
			const name = String(actor.name ?? "ACTOR").toUpperCase();
			const img = actor.img ?? "";
			const isOwner = actor.isOwner === true;

			const hp = Number(
				foundry.utils.getProperty(actor, "system.attributes.hp.value")
			);
			const downed = Number.isFinite(hp) ? hp <= 0 : false;

			const cd = cooldowns[actor.id];
			const onCooldown = !!cd && cd.remaining > 0 && cd.total > 0;
			const cooldownPct = onCooldown
				? Math.round((cd.remaining / cd.total) * 100)
				: 0;
			const cooldownLabel = onCooldown ? `${cd.remaining}/${cd.total}` : "";

			const potRaw = Number(
				foundry.utils.getProperty(actor, "system.attributes.xp.value")
			);
			const potential = clampInt(potRaw, 0, 5);
			const potentialPct = Math.round((potential / 5) * 100);

			return {
				actorId: actor.id,
				name,
				img,
				downed,
				onCooldown,
				cooldownPct,
				cooldownLabel,
				potential,
				potentialPct,
				showOwnerStar: isOwner,
				showOwnerPlusPlus: isOwner,
				showGmTurnBtn: game.user?.isGM === true,
			};
		});

		const html = await renderTemplate(TEMPLATE, {
			cards,
			showGmCard: game.user?.isGM === true,
		});

		this.root.innerHTML = html;
		this.root.classList.remove("is-hidden");
	},

	_activateListeners() {
		if (!this.root || this._bound) return;

		this.root.addEventListener(
			"click",
			async (ev) => {
				const t = ev.target;
				if (!(t instanceof HTMLElement)) return;

				const actionEl = t.closest("[data-action]");
				const action = actionEl?.dataset?.action ?? null;

				// GM card has no actor-id
				const cardEl = t.closest(".mthd-card");
				const actorId = cardEl?.dataset?.actorId ?? null;

				// Stop sheet-open for any button action
				const stop = () => {
					ev.preventDefault();
					ev.stopPropagation();
					ev.stopImmediatePropagation();
				};

				if (action === "noop") {
					stop();
					return;
				}

				if (action === "potential") {
					stop();
					if (!actorId) return;
					await this._addPotential(actorId);
					return;
				}

				if (action === "markTurn") {
					stop();
					if (!actorId) return;
					await this._markTurnTaken(actorId);
					return;
				}

				if (action === "gmTurn") {
					stop();
					await this._markTurnTaken(null); // GM/NPC turn
					return;
				}

				// Open sheet on card click
				const openedByClickingCard = !!t.closest(".mthd-card");
				if (!openedByClickingCard) return;
				stop();
				if (!actorId) return;
				this._openSheet(actorId);
			},
			{ capture: true }
		);

		this._bound = true;
	},

	_openSheet(actorId) {
		const actor = this._getActor(actorId);
		if (!actor) return;
		try {
			actor.sheet?.render?.(true);
		} catch (err) {
			console.warn(`[${NS}] Could not open sheet for actor ${actorId}`, err);
		}
	},

	async _addPotential(actorId) {
		const actor = this._getActor(actorId);
		if (!actor) return;

		if (!(game.user?.isGM || actor.isOwner === true)) {
			ui.notifications?.warn?.("You don't have permission to modify that actor.");
			return;
		}

		const path = "system.attributes.xp.value";
		const before = clampInt(foundry.utils.getProperty(actor, path), 0, 999);
		const after = clampInt(before + 1, 0, 5);
		if (after === before) return;

		try {
			await actor.update({ [path]: after });
		} catch (err) {
			console.error(`[${NS}] Failed to add Potential for ${actor.name}`, err);
			ui.notifications?.error?.("Couldn’t update Potential (see console).");
		}
	},

	async _markTurnTaken(actorIdOrNull) {
		// GM-only mutation
		if (!game.user?.isGM) return;

		const combat = getActiveCombat();
		if (!combat) return;

		const teamActors = this._getTeamActors(combat);
		const teamIds = teamActors.map((a) => a.id);
		const teamIdSet = new Set(teamIds);
		const teamSize = teamIds.length;

		const state = this._normalizeStateForTeam(this._readState(combat), teamIdSet);
		const cooldowns = state.cooldowns ?? (state.cooldowns = {});

		// Decrement everyone else who is currently on cooldown
		for (const id of teamIds) {
			if (actorIdOrNull && id === actorIdOrNull) continue;
			const cd = cooldowns[id];
			if (!cd) continue;

			const total = clampInt(cd.total, 0, 999);
			const remaining = clampInt(cd.remaining, 0, 999);
			const nextRemaining = Math.max(0, remaining - 1);

			if (total <= 0 || nextRemaining <= 0) delete cooldowns[id];
			else cooldowns[id] = { total, remaining: nextRemaining };
		}

		// If a specific actor took a turn, set their cooldown to full (teamSize-1 at that moment)
		if (actorIdOrNull && teamIdSet.has(actorIdOrNull)) {
			const total = Math.max(0, teamSize - 1);
			if (total <= 0) delete cooldowns[actorIdOrNull];
			else cooldowns[actorIdOrNull] = { total, remaining: total };
		}

		try {
			await combat.setFlag(NS, FLAG_KEY, { v: 1, cooldowns });
		} catch (err) {
			console.error(`[${NS}] Failed to update turn cooldowns`, err);
			ui.notifications?.error?.("Couldn’t update turn cooldowns (see console).");
		}
	},
};

Hooks.once("ready", async () => {
	try {
		await MasksTurnHUD.mount();
	} catch (err) {
		console.error(`[${NS}] Turn HUD mount failed`, err);
	}
});
