/* global Hooks, game, ui, foundry, renderTemplate, ChatMessage, CONST, canvas, Dialog, ContextMenu */

import {
	normalize,
	candidateTokenNames,
	compositeKey,
	InfluenceIndex,
} from "./helpers/influence.mjs";

/**
 * masks-newgeneration-unofficial / turn-cards.mjs
 * ----------------------------------------------------------------------------
 * Team Turn Cards HUD - Revised Implementation
 *
 * Features:
 * - Shows playable Characters (actor.type === "character") in the active Combat
 * - Cooldown system: can't act again until all other PCs have acted
 * - Team pool integration with +/- controls
 * - Potential (XP) tracking via star icon
 * - Shift Labels via pentagon icon
 * - Aid button (spend Team → +1 Forward) for non-owners
 * - Context menu for Influence actions
 * - Proper permission handling for GMs and players
 */

(() => {
	const NS = "masks-newgeneration-unofficial";
	const SOCKET_NS = "module.masks-newgeneration-unofficial";

	// Combat flag: cooldown remaining turns by combatant id
	const FLAG_COOLDOWN_MAP = "turnCardsCooldownMap";

	// Legacy (Combatant flag): kept for migration only
	const FLAG_REMAINING_OLD = "turnCardsRemainingTurns";

	// Actor fallback flag for potential if the sheet doesn't have system.attributes.xp
	const FLAG_POTENTIAL_FALLBACK = "turnCardsPotential";

	const POTENTIAL_MAX = 5;

	const TEAM_SPEND_UUID =
		"@UUID[Compendium.masks-newgeneration-unofficial.moves.Item.H7mJLUYVlQ3ZPGHK]{Spending Team}";

	// Influence settings (already registered by tools.mjs)
	const KEY_ANNOUNCE_INFLUENCE = "announceInfluenceChanges";
	const KEY_USE_GM_INFLUENCE = "quickInfluenceUseGMRelay";

	const LABEL_KEYS = Object.freeze([
		"danger",
		"freak",
		"savior",
		"superior",
		"mundane",
	]);

	/**
	 * Clamp a number to an integer within [lo, hi].
	 */
	const clampInt = (n, lo, hi) => {
		const x = Number(n);
		if (!Number.isFinite(x)) return lo;
		return Math.min(hi, Math.max(lo, Math.floor(x)));
	};

	function getActiveCombat() {
		return game.combats?.active ?? ui.combat?.viewed ?? null;
	}

	function getTeamCombatants(combat) {
		const list = combat?.combatants?.contents ?? combat?.combatants ?? [];
		return Array.from(list).filter((cbt) => {
			const a = cbt?.actor;
			return !!a && a.type === "character";
		});
	}

	function canEditCombatant(cbt) {
		return game.user?.isGM || cbt?.isOwner === true;
	}

	function canEditActor(actor) {
		return game.user?.isGM || actor?.isOwner === true;
	}

	function hasAnyActiveGM() {
		const users = game.users?.contents ?? game.users ?? [];
		return users.some((u) => u?.isGM && u?.active);
	}

	function actorPotentialValue(actor) {
		const xpVal = Number(
			foundry?.utils?.getProperty?.(actor, "system.attributes.xp.value")
		);
		if (Number.isFinite(xpVal)) return clampInt(xpVal, 0, POTENTIAL_MAX);

		const flagVal = Number(actor?.getFlag?.(NS, FLAG_POTENTIAL_FALLBACK));
		if (Number.isFinite(flagVal)) return clampInt(flagVal, 0, POTENTIAL_MAX);

		return 0;
	}

	async function setActorPotential(actor, nextVal) {
		const v = clampInt(nextVal, 0, POTENTIAL_MAX);
		if (!actor) return;

		const hasXpPath =
			foundry?.utils?.getProperty?.(actor, "system.attributes.xp") !== undefined;
		try {
			if (hasXpPath) {
				await actor.update({ "system.attributes.xp.value": v });
			} else {
				await actor.setFlag(NS, FLAG_POTENTIAL_FALLBACK, v);
			}
		} catch (err) {
			console.error(`[${NS}] Failed to set potential for ${actor?.name}`, err);
			ui.notifications?.warn?.(
				"You don't have permission to change that character's Potential."
			);
		}
	}

	function isDowned(cbt) {
		const defeated = cbt?.defeated === true;
		const hp = Number(
			foundry?.utils?.getProperty?.(cbt?.actor, "system.attributes.hp.value")
		);
		const hpZero = Number.isFinite(hp) && hp <= 0;
		return defeated || hpZero;
	}

	function statLabel(actor, key) {
		return (
			foundry.utils.getProperty(actor, `system.stats.${key}.label`) ||
			game.pbta?.sheetConfig?.actorTypes?.character?.stats?.[key]?.label ||
			key.charAt(0).toUpperCase() + key.slice(1)
		);
	}

	function shiftBounds() {
		const min = Number(game.pbta?.sheetConfig?.minMod);
		const max = Number(game.pbta?.sheetConfig?.maxMod);
		const lo = Number.isFinite(min) ? min : -2;
		const hi = Number.isFinite(max) ? max : 3;
		return { lo, hi };
	}

	async function promptShiftLabels(actor, { title = null } = {}) {
		const labels = LABEL_KEYS.map((k) => ({
			key: k,
			label: String(statLabel(actor, k)),
		}));

		const escape = (s) => foundry.utils.escapeHTML(String(s));

		const optsUp = labels
			.map(
				(l, i) =>
					`<option value="${l.key}" ${i === 0 ? "selected" : ""}>${escape(
						l.label
					)}</option>`
			)
			.join("");

		const downDefaultIndex = labels.length > 1 ? 1 : 0;
		const optsDown = labels
			.map(
				(l, i) =>
					`<option value="${l.key}" ${
						i === downDefaultIndex ? "selected" : ""
					}>${escape(l.label)}</option>`
			)
			.join("");

		const content = `
			<form>
				<p style="margin:0 0 0.5rem 0;">Choose one Label to shift <b>up</b> and one to shift <b>down</b>.</p>
				<div class="form-group">
					<label>Shift up:</label>
					<select name="up">${optsUp}</select>
				</div>
				<div class="form-group">
					<label>Shift down:</label>
					<select name="down">${optsDown}</select>
				</div>
				<p class="notes" style="margin:0.35rem 0 0 0; opacity:0.8;">(They must be different.)</p>
			</form>
		`;

		return new Promise((resolve) => {
			new Dialog({
				title: title ?? `Shift Labels: ${actor?.name ?? "Character"}`,
				content,
				buttons: {
					ok: {
						label: "Shift",
						callback: (html) => {
							const root = html?.[0];
							const up = root?.querySelector("select[name='up']")?.value;
							const down = root?.querySelector("select[name='down']")?.value;
							if (!up || !down) return resolve(null);
							if (up === down) {
								ui.notifications?.warn?.("Choose two different Labels to shift.");
								return resolve(null);
							}
							resolve({ up, down });
						},
					},
					cancel: { label: "Cancel", callback: () => resolve(null) },
				},
				default: "ok",
				close: () => resolve(null),
			}).render(true);
		});
	}

	/**
	 * Apply label shifts and optionally announce to chat
	 * @param {Actor} actor - The actor to shift labels on
	 * @param {string} upKey - The label key to increase
	 * @param {string} downKey - The label key to decrease
	 * @param {object} options - Additional options
	 * @param {boolean} options.announce - Whether to post to chat (default: true)
	 * @param {string} options.reason - Reason for the shift (for chat message)
	 * @param {Actor} options.sourceActor - The actor causing the shift (for influence messages)
	 */
	async function applyShiftLabels(actor, upKey, downKey, options = {}) {
		const { announce = true, reason = "shift", sourceActor = null } = options;

		if (!actor) return false;
		const { lo, hi } = shiftBounds();

		const p = (k) => `system.stats.${k}.value`;
		const curUp = Number(foundry.utils.getProperty(actor, p(upKey)));
		const curDown = Number(foundry.utils.getProperty(actor, p(downKey)));

		if (!Number.isFinite(curUp) || !Number.isFinite(curDown)) {
			ui.notifications?.warn?.("This actor doesn't have a Labels track to shift.");
			return false;
		}

		const nextUp = clampInt(curUp + 1, lo, hi);
		const nextDown = clampInt(curDown - 1, lo, hi);

		const updates = {};
		let actuallyShiftedUp = false;
		let actuallyShiftedDown = false;

		if (nextUp !== curUp) {
			updates[p(upKey)] = nextUp;
			actuallyShiftedUp = true;
		}
		if (nextDown !== curDown) {
			updates[p(downKey)] = nextDown;
			actuallyShiftedDown = true;
		}

		if (!Object.keys(updates).length) {
			ui.notifications?.info?.("No Labels changed (already at limits).");
			return false;
		}

		try {
			await actor.update(updates);
		} catch (err) {
			console.error(`[${NS}] Failed to shift labels for ${actor.name}`, err);
			ui.notifications?.error?.("Couldn't shift labels (see console).");
			return false;
		}

		// Announce to chat if requested
		if (announce) {
			const upLabel = statLabel(actor, upKey);
			const downLabel = statLabel(actor, downKey);
			const actorName = foundry.utils.escapeHTML(actor.name ?? "Character");

			let content = "";

			if (reason === "useInfluence" && sourceActor) {
				const sourceName = foundry.utils.escapeHTML(sourceActor.name ?? "Someone");
				content = `<b>${sourceName}</b> uses Influence to shift <b>${actorName}</b>'s Labels: `;
			} else {
				content = `<b>${actorName}</b> shifts their Labels: `;
			}

			const parts = [];
			if (actuallyShiftedUp) {
				parts.push(
					`<span class="shift up">+${foundry.utils.escapeHTML(upLabel)}</span>`
				);
			}
			if (actuallyShiftedDown) {
				parts.push(
					`<span class="shift down">-${foundry.utils.escapeHTML(downLabel)}</span>`
				);
			}
			content += parts.join(", ");

			await ChatMessage.create({
				content,
				type: CONST.CHAT_MESSAGE_TYPES.OTHER,
			});
		}

		return true;
	}

	/* -------------------------- Influence helpers -------------------------- */

	function readInfluences(actor) {
		return foundry.utils.deepClone(actor.getFlag(NS, "influences") || []);
	}

	function pickStorageName(actor, token) {
		const cands = candidateTokenNames(actor, token);
		return cands[0] || actor?.name || token?.document?.name || "Unknown";
	}

	function ensureInfluenceEntry(arr, nameToMatch) {
		const want = normalize(nameToMatch);
		const idx = arr.findIndex((e) => normalize(e?.name) === want);
		if (idx >= 0) return { idx, obj: arr[idx] };

		const obj = {
			id: foundry.utils.randomID?.(16) ?? Math.random().toString(36).slice(2),
			name: nameToMatch,
			hasInfluenceOver: false,
			haveInfluenceOver: false,
			locked: false,
		};
		arr.push(obj);
		return { idx: arr.length - 1, obj };
	}

	function stateSymbol(e) {
		const out = !!e?.haveInfluenceOver;
		const inn = !!e?.hasInfluenceOver;
		if (out && inn) return "⬌";
		if (out) return "⬆";
		if (inn) return "⬇";
		return "x";
	}

	async function writeInfluencesIfChanged(actor, beforeArr, afterArr) {
		const sameLen = beforeArr.length === afterArr.length;
		let equal = sameLen;
		if (equal) {
			for (let i = 0; i < beforeArr.length; i++) {
				const a = beforeArr[i],
					b = afterArr[i];
				if (!a || !b) {
					equal = false;
					break;
				}
				if (
					normalize(a.name) !== normalize(b.name) ||
					!!a.hasInfluenceOver !== !!b.hasInfluenceOver ||
					!!a.haveInfluenceOver !== !!b.haveInfluenceOver ||
					!!a.locked !== !!b.locked
				) {
					equal = false;
					break;
				}
			}
		}
		if (equal) return false;

		await actor.setFlag(NS, "influences", afterArr);
		return true;
	}

	function mutateInfluenceSide(inflArr, counterpartyName, which) {
		const { idx, obj } = ensureInfluenceEntry(inflArr, counterpartyName);
		const prev = { has: !!obj.hasInfluenceOver, have: !!obj.haveInfluenceOver };

		if (obj.locked === true && which !== "reset") {
			return { changed: false, prev, now: prev, pruned: false };
		}

		if (which === "gt") {
			obj.haveInfluenceOver = true;
		} else if (which === "lt") {
			obj.hasInfluenceOver = true;
		} else if (which === "eq") {
			obj.haveInfluenceOver = true;
			obj.hasInfluenceOver = true;
		} else if (which === "reset") {
			obj.haveInfluenceOver = false;
			obj.hasInfluenceOver = false;
		}

		let pruned = false;
		if (!obj.hasInfluenceOver && !obj.haveInfluenceOver && obj.locked !== true) {
			inflArr.splice(idx, 1);
			pruned = true;
		}

		const now = { has: !!obj.hasInfluenceOver, have: !!obj.haveInfluenceOver };
		return {
			changed: prev.has !== now.has || prev.have !== now.have || pruned,
			prev,
			now,
			pruned,
		};
	}

	async function announceInfluenceChange(srcName, tgtName, beforeSym, afterSym) {
		if (!game.settings.get(NS, KEY_ANNOUNCE_INFLUENCE)) return;

		const badge = (s) => {
			const css =
				"display:inline-block;padding:0 .35rem;border-radius:.25rem;font-weight:700;";
			if (s === "⬆")
				return `<span style="${css}background:#4CAF50;color:#fff">${s}</span>`;
			if (s === "⬇")
				return `<span style="${css}background:#9C27B0;color:#fff">${s}</span>`;
			if (s === "⬌")
				return `<span style="${css}background:#2196F3;color:#fff">${s}</span>`;
			return `<span style="${css}background:#F44336;color:#fff">${s}</span>`;
		};

		let title = "Influence Change";
		switch (afterSym) {
			case "⬆":
				title = `${srcName} gains Influence over ${tgtName}`;
				break;
			case "⬇":
				title = `${srcName} gives Influence to ${tgtName}`;
				break;
			case "⬌":
				title = `${srcName} and ${tgtName}<br/>share Influence`;
				break;
			default:
				title = `${srcName} and ${tgtName}<br/>do not share Influence`;
				break;
		}

		let content = `<h6>${badge(afterSym)} ${title}</h6>`;
		if (beforeSym !== "x" && beforeSym !== afterSym) {
			content += `<b>Previous:</b> <em>${srcName}</em> ${badge(
				beforeSym
			)} <em>${tgtName}</em>`;
		}

		await ChatMessage.create({
			content,
			type: CONST.CHAT_MESSAGE_TYPES.OTHER,
		});
	}

	function requestGMApplyInfluence(payload) {
		try {
			game.socket?.emit(SOCKET_NS, payload);
		} catch (_) {
			/* symmetry sync is a fallback */
		}
	}

	async function applyInfluencePair({ actorA, tokA, actorB, tokB, directive }) {
		const useGMRelay = game.settings.get(NS, KEY_USE_GM_INFLUENCE) === true;

		if (!actorA || !actorB) return;
		if (actorA.type !== "character" || actorB.type !== "character") {
			ui.notifications?.warn?.("Influence actions are for Character ↔ Character.");
			return;
		}

		const aBefore = readInfluences(actorA);
		const bBefore = readInfluences(actorB);
		const aAfter = foundry.utils.deepClone(aBefore);
		const bAfter = foundry.utils.deepClone(bBefore);

		const nameAforB = pickStorageName(actorA, tokA);
		const nameBforA = pickStorageName(actorB, tokB);

		let aPrevSym = "—",
			aNowSym = "—";

		{
			const stA = mutateInfluenceSide(
				aAfter,
				nameBforA,
				directive === "gt"
					? "gt"
					: directive === "lt"
					? "lt"
					: directive === "eq"
					? "eq"
					: "reset"
			);
			aPrevSym = stateSymbol({
				hasInfluenceOver: stA.prev.has,
				haveInfluenceOver: stA.prev.have,
			});
			aNowSym = stateSymbol({
				hasInfluenceOver: stA.now.has,
				haveInfluenceOver: stA.now.have,
			});
		}

		{
			let whichB = "reset";
			if (directive === "gt") whichB = "lt";
			else if (directive === "lt") whichB = "gt";
			else if (directive === "eq") whichB = "eq";
			mutateInfluenceSide(bAfter, nameAforB, whichB);
		}

		const tasks = [];
		const gmPayload = {
			action: "applyPair",
			srcId: actorA.id,
			tgtId: actorB.id,
			directive,
		};

		if (canEditActor(actorA))
			tasks.push(writeInfluencesIfChanged(actorA, aBefore, aAfter));
		else if (useGMRelay) gmPayload.aAfter = aAfter;

		if (canEditActor(actorB))
			tasks.push(writeInfluencesIfChanged(actorB, bBefore, bAfter));
		else if (useGMRelay) gmPayload.bAfter = bAfter;

		if (useGMRelay && (!canEditActor(actorA) || !canEditActor(actorB))) {
			requestGMApplyInfluence(gmPayload);
		}

		try {
			await Promise.all(tasks);
		} catch (err) {
			console.error(`[${NS}] Failed to set Influence`, err);
			ui.notifications?.error?.("Couldn't update Influence (see console).");
			return;
		}

		try {
			await InfluenceIndex?.syncCharacterPairFlags?.(actorA);
		} catch (_) {
			/* no-op */
		}

		const aLabel = actorA.name ?? tokA?.document?.name ?? "A";
		await announceInfluenceChange(aLabel, nameBforA, aPrevSym, aNowSym);

		return true;
	}

	/* ---------------------------------- HUD ---------------------------------- */

	const TurnCardsHUD = {
		root: null,
		_hooksRegistered: false,
		_renderQueued: false,
		_socketRegistered: false,
		_contextMenu: null,

		mount() {
			const host =
				document.querySelector("#ui-middle #ui-bottom") ||
				document.querySelector("#ui-bottom") ||
				document.querySelector("#ui-middle") ||
				document.body;

			this.root?.remove();

			this.root = document.createElement("section");
			this.root.id = "masks-turncards";
			this.root.setAttribute("role", "group");
			this.root.setAttribute("aria-label", "Team Turn Cards");

			host.appendChild(this.root);

			this._activateListeners();
			this._registerHooks();
			this._initSocket();

			if (game.user?.isGM)
				this.normalizeCooldowns().finally(() => this._queueRender());
			else this._queueRender();
		},

		_registerHooks() {
			if (this._hooksRegistered) return;
			this._hooksRegistered = true;

			Hooks.on("createCombat", () => this._queueRender());
			Hooks.on("deleteCombat", () => this._queueRender());

			Hooks.on("updateCombat", (doc, changes) => {
				const active = getActiveCombat();
				const isRelevant = doc?.id && active?.id && doc.id === active.id;

				const flagChanged =
					foundry.utils.getProperty(changes, `flags.${NS}.${FLAG_COOLDOWN_MAP}`) !==
					undefined;

				// Check if round advanced - reset cooldowns
				const roundChanged = Object.prototype.hasOwnProperty.call(
					changes ?? {},
					"round"
				);
				if (roundChanged && isRelevant && game.user?.isGM) {
					// Reset all cooldowns on round change
					this._resetAllCooldowns(doc).finally(() => this._queueRender());
					return;
				}

				if (flagChanged) this._queueRender();
				if (doc?.active === true || isRelevant) this._queueRender();
				if (Object.prototype.hasOwnProperty.call(changes ?? {}, "active"))
					this._queueRender();
			});

			Hooks.on("createCombatant", (cbt) => {
				if (cbt?.combat?.id !== getActiveCombat()?.id) return;
				if (game.user?.isGM)
					this.normalizeCooldowns().finally(() => this._queueRender());
				else this._queueRender();
			});

			Hooks.on("deleteCombatant", (cbt) => {
				if (cbt?.combat?.id !== getActiveCombat()?.id) return;
				if (game.user?.isGM)
					this.normalizeCooldowns().finally(() => this._queueRender());
				else this._queueRender();
			});

			Hooks.on("updateCombatant", (doc, changes) => {
				if (doc?.combat?.id !== getActiveCombat()?.id) return;
				const defeatedChanged = Object.prototype.hasOwnProperty.call(
					changes ?? {},
					"defeated"
				);
				if (defeatedChanged) this._queueRender();
			});

			Hooks.on("updateActor", (_actor, changes) => {
				const xpChanged =
					foundry.utils.getProperty(changes, "system.attributes.xp.value") !==
					undefined;
				const imgChanged = changes?.img !== undefined;
				const nameChanged = changes?.name !== undefined;
				const hpChanged =
					foundry.utils.getProperty(changes, "system.attributes.hp.value") !==
					undefined;
				const fallbackPotChanged =
					foundry.utils.getProperty(
						changes,
						`flags.${NS}.${FLAG_POTENTIAL_FALLBACK}`
					) !== undefined;
				const statsChanged =
					foundry.utils.getProperty(changes, "system.stats") !== undefined;

				if (
					xpChanged ||
					imgChanged ||
					nameChanged ||
					hpChanged ||
					fallbackPotChanged ||
					statsChanged
				)
					this._queueRender();
			});

			Hooks.on("canvasReady", () => {
				if (!document.getElementById("masks-turncards")) this.mount();
				else this._queueRender();
			});

			Hooks.on("masksTeamUpdated", () => this._queueRender());
			Hooks.on("masksTeamConfigChanged", () => this._queueRender());
		},

		_initSocket() {
			if (this._socketRegistered) return;
			this._socketRegistered = true;

			try {
				game.socket?.on(SOCKET_NS, async (data) => {
					if (!data || !data.action) return;
					if (!game.user?.isGM) return;

					if (data.action === "turnCardsMark") {
						const actorId = data.actorId;
						if (!actorId) return;
						await this.onActorTurn(actorId);
						await this.advanceCooldowns(actorId);
						return;
					}

					if (data.action === "turnCardsTeamForward") {
						const actorId = data.actorId;
						if (!actorId) return;
						await this._gmApplyTeamForward(actorId, data.userId ?? null);
						return;
					}

					if (data.action === "turnCardsShiftLabels") {
						const { targetActorId, sourceActorId, up, down, reason } = data;
						if (!targetActorId || !up || !down) return;
						await this._gmApplyShiftLabels({
							targetActorId,
							sourceActorId: sourceActorId ?? null,
							up,
							down,
							reason: reason ?? "shift",
						});
					}
				});
			} catch (err) {
				console.warn(
					`[${NS}] Socket unavailable; some Turn Cards relays require GM permissions.`,
					err
				);
			}
		},

		_activateListeners() {
			if (!this.root) return;
			if (this.root.dataset.bound === "1") return;

			this.root.addEventListener(
				"click",
				async (ev) => {
					const target = ev.target instanceof HTMLElement ? ev.target : null;
					if (!target) return;

					const actionEl = target.closest?.("[data-action]");
					if (actionEl) {
						const action = actionEl.dataset.action;

						ev.preventDefault();
						ev.stopPropagation();
						ev.stopImmediatePropagation?.();

						if (action === "potential") {
							await this._handlePotentialClick(actionEl, +1);
							return;
						}

						if (action === "gm-turn") {
							if (!game.user?.isGM) return;
							await this.advanceCooldowns(null);
							return;
						}

						if (action === "card-action") {
							const actorId = actionEl.dataset.actorId ?? null;
							if (!actorId) return;

							if (game.user?.isGM) {
								await this.onActorTurn(actorId);
								await this.advanceCooldowns(actorId);
							} else {
								this._requestGmMarkActorTurn(actorId);
							}
							return;
						}

						if (action === "card-aid" || action === "team-forward") {
							await this._handleTeamForwardClick(actionEl);
							return;
						}

						if (action === "shift-labels") {
							await this._handleShiftLabelsClick(actionEl);
							return;
						}

						if (action === "team-minus") {
							const svc = globalThis.MasksTeam;
							if (!svc) return;
							const step = ev.shiftKey ? -5 : -1;
							await svc.change?.(step);
							return;
						}

						if (action === "team-plus") {
							const svc = globalThis.MasksTeam;
							if (!svc) return;
							const step = ev.shiftKey ? 5 : 1;
							await svc.change?.(step);
							return;
						}

						if (action === "team-reset") {
							const svc = globalThis.MasksTeam;
							if (!svc) return;
							await svc.set?.(0);
							return;
						}

						return;
					}

					const card = target.closest?.(".turncard[data-combatant-id]");
					if (!card) return;

					const combatantId = card.dataset.combatantId;
					const combat = getActiveCombat();
					const cbt = combat?.combatants?.get?.(combatantId);
					const actor = cbt?.actor;
					if (!actor) return;

					actor.sheet?.render?.(true);
				},
				{ capture: true }
			);

			// Right-click Potential star to subtract
			this.root.addEventListener(
				"contextmenu",
				async (ev) => {
					const target = ev.target instanceof HTMLElement ? ev.target : null;
					if (!target) return;

					const potBtn = target.closest?.("[data-action='potential']");
					if (potBtn) {
						ev.preventDefault();
						ev.stopPropagation();
						ev.stopImmediatePropagation?.();
						await this._handlePotentialClick(potBtn, -1);
						return;
					}
				},
				{ capture: true }
			);

			// Keyboard accessibility for card open (Enter/Space)
			this.root.addEventListener("keydown", (ev) => {
				const target = ev.target instanceof HTMLElement ? ev.target : null;
				if (!target) return;
				if (ev.key !== "Enter" && ev.key !== " ") return;

				const card = target.closest?.(".turncard[data-combatant-id]");
				if (!card) return;

				if (target.closest?.("button")) return;

				ev.preventDefault();
				card.click();
			});

			this.root.dataset.bound = "1";
		},

		_setupContextMenu() {
			// Use jQuery if available, otherwise try to use native ContextMenu
			const $ = globalThis.jQuery ?? globalThis.$;

			if (!$ || !this.root) {
				console.warn(`[${NS}] jQuery not available for context menu`);
				return;
			}

			// Destroy existing context menu if any
			if (this._contextMenu) {
				try {
					this._contextMenu.close?.();
				} catch (_) {}
				this._contextMenu = null;
			}

			const menuItems = [
				{
					name: "Gain Influence over",
					icon: '<i class="fa-solid fa-up"></i>',
					callback: (li) => this._ctxInfluence(li, "gt"),
				},
				{
					name: "Gain Synergy (mutual influence)",
					icon: '<i class="fa-solid fa-left-right"></i>',
					callback: (li) => this._ctxInfluence(li, "eq"),
				},
				{
					name: "Give Influence to",
					icon: '<i class="fa-solid fa-down"></i>',
					callback: (li) => this._ctxInfluence(li, "lt"),
				},
				{
					name: "Use Influence against…",
					icon: '<i class="fa-solid fa-bullseye"></i>',
					callback: (li) => this._ctxUseInfluence(li),
				},
			];

			try {
				this._contextMenu = new ContextMenu(
					$(this.root),
					".turncard[data-actor-id]:not(.turncard--gm)",
					menuItems
				);
			} catch (err) {
				console.warn(`[${NS}] Failed to create context menu`, err);
			}
		},

		_ctxElFromLi(li) {
			if (!li) return null;
			if (li instanceof HTMLElement) return li;
			if (Array.isArray(li) && li[0] instanceof HTMLElement) return li[0];
			if (li?.[0] instanceof HTMLElement) return li[0];
			return null;
		},

		async _resolveInfluenceSource() {
			const controlled = canvas?.tokens?.controlled ?? [];
			if (controlled.length === 1 && controlled[0]?.actor) {
				return { token: controlled[0], actor: controlled[0].actor };
			}

			const myActor = game.user?.character;
			if (myActor) {
				const tok =
					(canvas.tokens?.placeables ?? []).find(
						(t) => t?.actor?.id === myActor.id
					) || null;
				return { token: tok, actor: myActor };
			}

			const owned = (canvas.tokens?.placeables ?? []).find(
				(t) => t.actor && t.actor.isOwner
			);
			if (owned) return { token: owned, actor: owned.actor };

			ui.notifications?.warn?.(
				"Select your character token or set your User Character first."
			);
			return null;
		},

		async _ctxInfluence(li, directive) {
			const el = this._ctxElFromLi(li);
			const targetActorId = el?.dataset?.actorId ?? null;
			if (!targetActorId) return;

			const targetActor = game.actors?.get?.(targetActorId);
			if (!targetActor) return;

			const src = await this._resolveInfluenceSource();
			if (!src?.actor) return;

			if (src.actor.id === targetActor.id) {
				ui.notifications?.warn?.(
					"Pick someone else's card to set Influence with them."
				);
				return;
			}

			const tgtTok =
				(canvas.tokens?.placeables ?? []).find(
					(t) => t?.actor?.id === targetActor.id
				) || null;

			await applyInfluencePair({
				actorA: src.actor,
				tokA: src.token ?? null,
				actorB: targetActor,
				tokB: tgtTok,
				directive,
			});
		},

		async _ctxUseInfluence(li) {
			const el = this._ctxElFromLi(li);
			const targetActorId = el?.dataset?.actorId ?? null;
			if (!targetActorId) return;

			const targetActor = game.actors?.get?.(targetActorId);
			if (!targetActor) return;

			const src = await this._resolveInfluenceSource();
			if (!src?.actor) return;

			if (src.actor.id === targetActor.id) {
				ui.notifications?.warn?.("You can't use Influence against yourself.");
				return;
			}

			// Verify src has Influence over target
			const has = InfluenceIndex.hasEdgeFromKeyToKey(
				compositeKey(src.actor),
				compositeKey(targetActor)
			);
			if (!has) {
				ui.notifications?.warn?.(
					`You don't have Influence over ${targetActor.name}.`
				);
				return;
			}

			const picked = await promptShiftLabels(targetActor, {
				title: `Use Influence on: ${targetActor.name}`,
			});
			if (!picked) return;

			if (canEditActor(targetActor)) {
				await applyShiftLabels(targetActor, picked.up, picked.down, {
					announce: true,
					reason: "useInfluence",
					sourceActor: src.actor,
				});
			} else {
				if (!game.socket || !hasAnyActiveGM()) {
					ui.notifications?.warn?.("A GM must be online to apply that label shift.");
					return;
				}
				this._requestGmShiftLabels({
					targetActorId: targetActor.id,
					sourceActorId: src.actor.id,
					up: picked.up,
					down: picked.down,
					reason: "useInfluence",
				});
			}
		},

		async _handlePotentialClick(actionEl, delta) {
			const wrap = actionEl.closest?.("[data-combatant-id]");
			const combatantId = wrap?.dataset?.combatantId ?? null;
			if (!combatantId) return;

			const combat = getActiveCombat();
			const cbt = combat?.combatants?.get?.(combatantId);
			const actor = cbt?.actor;
			if (!actor) return;

			if (!canEditActor(actor)) {
				ui.notifications?.warn?.(
					"You don't have permission to change that character's Potential."
				);
				return;
			}

			const cur = actorPotentialValue(actor);
			const next = clampInt(cur + delta, 0, POTENTIAL_MAX);
			if (next === cur) return;

			await setActorPotential(actor, next);

			actionEl.classList.remove("is-bump");
			void actionEl.offsetHeight;
			actionEl.classList.add("is-bump");

			this._queueRender();
		},

		async _handleShiftLabelsClick(actionEl) {
			const actorId = actionEl.dataset.actorId ?? null;
			if (!actorId) return;

			const actor = game.actors?.get?.(actorId);
			if (!actor) return;

			if (!canEditActor(actor)) {
				ui.notifications?.warn?.(
					"You don't have permission to shift that character's Labels."
				);
				return;
			}

			const picked = await promptShiftLabels(actor, {
				title: `Shift Labels: ${actor.name}`,
			});
			if (!picked) return;

			const ok = await applyShiftLabels(actor, picked.up, picked.down, {
				announce: true,
				reason: "shift",
			});
			if (ok) this._queueRender();
		},

		async _handleTeamForwardClick(actionEl) {
			const actorId = actionEl.dataset.actorId ?? null;
			if (!actorId) return;

			const actor = game.actors?.get?.(actorId);
			if (!actor) return;

			const teamSvc = globalThis.MasksTeam;
			if (!teamSvc) {
				ui.notifications?.warn?.(
					"Team pool is not available yet. A GM may need to open the world first."
				);
				return;
			}

			if (teamSvc.value <= 0) {
				ui.notifications?.warn?.("There's no Team left to spend.");
				return;
			}

			const canDoLocal = teamSvc.canEdit === true && canEditActor(actor) === true;
			const canRelay = !!game.socket && hasAnyActiveGM();

			if (!canDoLocal) {
				if (!canRelay) {
					ui.notifications?.warn?.(
						"You don't have permission to Aid that character (and no GM is available to relay)."
					);
					return;
				}
				this._requestGmTeamForward(actorId);
				return;
			}

			const forwardPath = "system.resources.forward.value";
			const currentForward =
				Number(foundry.utils.getProperty(actor, forwardPath)) || 0;
			const nextForward = Math.max(0, currentForward + 1);

			try {
				await teamSvc.change?.(-1, { announce: false });
				await actor.update({ [forwardPath]: nextForward });

				const safeName =
					foundry.utils.escapeHTML?.(actor.name ?? "Character") ??
					actor.name ??
					"Character";
				const content = `${TEAM_SPEND_UUID} — ${safeName} gains <b>+1 Forward</b>.`;

				await ChatMessage.create({
					content,
					type: CONST.CHAT_MESSAGE_TYPES.OTHER,
				});
			} catch (err) {
				console.error(
					`[${NS}] Failed to spend Team / grant +1 Forward for ${actor.name}`,
					err
				);
				ui.notifications?.error?.(
					"Couldn't spend Team for that action (see console)."
				);
				return;
			}

			actionEl.classList.remove("is-bump");
			void actionEl.offsetHeight;
			actionEl.classList.add("is-bump");

			this._queueRender();
		},

		async _gmApplyTeamForward(actorId, userId = null) {
			const actor = game.actors?.get?.(actorId);
			if (!actor) return;

			const teamSvc = globalThis.MasksTeam;
			if (!teamSvc) return;

			if (teamSvc.value <= 0) return;

			const forwardPath = "system.resources.forward.value";
			const currentForward =
				Number(foundry.utils.getProperty(actor, forwardPath)) || 0;
			const nextForward = Math.max(0, currentForward + 1);

			try {
				await teamSvc.change?.(-1, { announce: false });
				await actor.update({ [forwardPath]: nextForward });

				const safeName =
					foundry.utils.escapeHTML?.(actor.name ?? "Character") ??
					actor.name ??
					"Character";
				const by = userId ? game.users?.get?.(userId)?.name ?? null : null;

				const content =
					`${TEAM_SPEND_UUID} — ${safeName} gains <b>+1 Forward</b>.` +
					(by
						? ` <span class="color-muted">— requested by ${foundry.utils.escapeHTML(
								by
						  )}</span>`
						: "");

				await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
			} catch (err) {
				console.error(`[${NS}] GM failed to apply Aid for ${actor.name}`, err);
			} finally {
				this._queueRender();
			}
		},

		async _gmApplyShiftLabels({
			targetActorId,
			sourceActorId = null,
			up,
			down,
			reason = "shift",
		}) {
			const target = game.actors?.get?.(targetActorId);
			if (!target) return;

			// If this is "Use Influence", validate again on the GM for safety
			let sourceActor = null;
			if (reason === "useInfluence" && sourceActorId) {
				sourceActor = game.actors?.get?.(sourceActorId);
				const ok =
					!!sourceActor &&
					InfluenceIndex.hasEdgeFromKeyToKey(
						compositeKey(sourceActor),
						compositeKey(target)
					);
				if (!ok) return;
			}

			await applyShiftLabels(target, up, down, {
				announce: true,
				reason,
				sourceActor,
			});

			this._queueRender();
		},

		_requestGmMarkActorTurn(actorId) {
			try {
				game.socket?.emit(SOCKET_NS, { action: "turnCardsMark", actorId });
			} catch (err) {
				console.warn(
					`[${NS}] Socket emit failed; Turn Cards mark requires GM permissions.`,
					err
				);
			}
		},

		_requestGmTeamForward(actorId) {
			try {
				game.socket?.emit(SOCKET_NS, {
					action: "turnCardsTeamForward",
					actorId,
					userId: game.user?.id ?? null,
				});
			} catch (err) {
				console.warn(`[${NS}] Socket emit failed; Aid requires GM.`, err);
			}
		},

		_requestGmShiftLabels({ targetActorId, sourceActorId, up, down, reason }) {
			try {
				game.socket?.emit(SOCKET_NS, {
					action: "turnCardsShiftLabels",
					targetActorId,
					sourceActorId,
					up,
					down,
					reason,
					userId: game.user?.id ?? null,
				});
			} catch (err) {
				console.warn(
					`[${NS}] Socket emit failed; Shift Labels relay requires GM.`,
					err
				);
			}
		},

		_queueRender() {
			if (this._renderQueued) return;
			this._renderQueued = true;
			setTimeout(async () => {
				try {
					await this.render();
				} finally {
					this._renderQueued = false;
				}
			}, 10);
		},

		_teamSizeAndMaxTurns(combat) {
			const team = getTeamCombatants(combat);
			const size = team.length;
			const maxTurns = Math.max(0, size - 1);
			return { team, size, maxTurns };
		},

		_readCooldownMap(combat) {
			const raw = combat?.getFlag?.(NS, FLAG_COOLDOWN_MAP);
			if (!raw || typeof raw !== "object") return {};
			return foundry.utils.deepClone(raw);
		},

		async _writeCooldownMap(combat, mapObj) {
			if (!combat) return;
			const map = mapObj && typeof mapObj === "object" ? mapObj : {};
			const keys = Object.keys(map);

			try {
				if (!keys.length) await combat.unsetFlag(NS, FLAG_COOLDOWN_MAP);
				else await combat.setFlag(NS, FLAG_COOLDOWN_MAP, map);
			} catch (err) {
				console.warn(`[${NS}] Failed to write combat cooldown map`, err);
			}
		},

		_getRemainingFromMap(map, combatantId, maxTurns) {
			const raw = Number(map?.[combatantId] ?? NaN);
			const n = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
			return Math.min(n, Math.max(0, maxTurns));
		},

		/**
		 * Reset all cooldowns (called on round advance)
		 */
		async _resetAllCooldowns(combat) {
			if (!combat) combat = getActiveCombat();
			if (!combat) return;
			if (!game.user?.isGM) return;

			await this._writeCooldownMap(combat, {});
		},

		/**
		 * GM-only: Clamp and migrate cooldown storage.
		 */
		async normalizeCooldowns() {
			const combat = getActiveCombat();
			if (!combat) return;
			if (!game.user?.isGM) return;

			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);

			let map = this._readCooldownMap(combat);
			let changed = false;

			if (maxTurns <= 0) {
				if (Object.keys(map).length) {
					map = {};
					changed = true;
				}
				for (const cbt of team) {
					try {
						await cbt.unsetFlag(NS, FLAG_REMAINING_OLD);
					} catch (_) {
						/* ignore */
					}
				}
				if (changed) await this._writeCooldownMap(combat, map);
				return;
			}

			// Migrate legacy combatant flags → map
			for (const cbt of team) {
				const id = cbt.id;
				if (!id) continue;

				if (map[id] === undefined) {
					const old = Number(cbt.getFlag?.(NS, FLAG_REMAINING_OLD));
					if (Number.isFinite(old) && old > 0) {
						map[id] = Math.min(maxTurns, Math.max(0, Math.floor(old)));
						changed = true;
					}
				}

				try {
					const had = cbt.getFlag?.(NS, FLAG_REMAINING_OLD) !== undefined;
					if (had) await cbt.unsetFlag(NS, FLAG_REMAINING_OLD);
				} catch (_) {
					/* ignore */
				}
			}

			// Remove entries for missing combatants; clamp remaining
			const ids = new Set(team.map((c) => c.id));
			for (const [id, v] of Object.entries(map)) {
				if (!ids.has(id)) {
					delete map[id];
					changed = true;
					continue;
				}
				const n = Math.min(maxTurns, Math.max(0, Math.floor(Number(v) || 0)));
				if (n <= 0) {
					delete map[id];
					changed = true;
				} else if (n !== v) {
					map[id] = n;
					changed = true;
				}
			}

			if (changed) await this._writeCooldownMap(combat, map);
		},

		/**
		 * GM-only: Called when a character takes a turn.
		 */
		async onActorTurn(actorId) {
			const combat = getActiveCombat();
			if (!combat) return;
			if (!game.user?.isGM) return;

			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);
			if (maxTurns <= 0) {
				await this.normalizeCooldowns();
				this._queueRender();
				return;
			}

			const acting = team.find((cbt) => cbt?.actor?.id === actorId);
			if (!acting) return;

			const map = this._readCooldownMap(combat);
			map[acting.id] = maxTurns;
			await this._writeCooldownMap(combat, map);
			this._queueRender();
		},

		/**
		 * GM-only: Decrement remainingTurns for every other combatant currently > 0.
		 */
		async advanceCooldowns(excludeActorId = null) {
			const combat = getActiveCombat();
			if (!combat) return;
			if (!game.user?.isGM) return;

			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);
			if (maxTurns <= 0) {
				await this.normalizeCooldowns();
				this._queueRender();
				return;
			}

			const map = this._readCooldownMap(combat);
			let changed = false;

			for (const cbt of team) {
				const a = cbt?.actor;
				if (!a) continue;

				if (excludeActorId && a.id === excludeActorId) continue;

				const cur = this._getRemainingFromMap(map, cbt.id, maxTurns);
				if (cur <= 0) continue;

				const next = cur - 1;
				if (next <= 0) delete map[cbt.id];
				else map[cbt.id] = next;

				changed = true;
			}

			if (changed) await this._writeCooldownMap(combat, map);
			this._queueRender();
		},

		async render() {
			if (!this.root) return;

			const combat = getActiveCombat();
			if (!combat) {
				this.root.style.display = "none";
				this.root.innerHTML = "";
				return;
			}

			const { team, size: teamSize, maxTurns } = this._teamSizeAndMaxTurns(combat);
			if (!team.length) {
				this.root.style.display = "none";
				this.root.innerHTML = "";
				return;
			}

			this.root.style.display = "";

			const teamSvc = globalThis.MasksTeam;
			const teamValue = teamSvc?.value ?? 0;
			const teamUiCanEdit = teamSvc?.canEdit ?? false;
			const showTeamCard = !!teamSvc;

			const isGM = game.user?.isGM === true;
			const cooldownMap = this._readCooldownMap(combat);

			const cards = team.map((cbt) => {
				const actor = cbt.actor;

				const ownsActor = canEditActor(actor);
				const ownsCombatant = canEditCombatant(cbt);
				const downed = isDowned(cbt);

				const remaining = this._getRemainingFromMap(cooldownMap, cbt.id, maxTurns);
				const onCooldown = remaining > 0 && maxTurns > 0;

				const cooldownFrac =
					onCooldown && maxTurns > 0
						? Math.max(0, Math.min(1, remaining / maxTurns))
						: 0;

				const potential = actorPotentialValue(actor);
				const potentialPct =
					POTENTIAL_MAX > 0
						? `${Math.round((potential / POTENTIAL_MAX) * 100)}%`
						: "0%";

				const status = downed ? "down" : onCooldown ? "busy" : "ready";
				const statusLabel = downed ? "Downed" : onCooldown ? "Busy" : "Ready";

				// Action vs Aid overlay logic
				// GMs can always take Action for anyone
				// Owners can take Action for their own characters
				// Others see Aid button instead
				const canMarkTurn = isGM || ownsCombatant;
				const readyToAct = !downed && !onCooldown;

				// For GMs: they can always click Action regardless of cooldown/ready state
				// For owners: they can only click if ready
				const canAction = isGM ? !downed : canMarkTurn && readyToAct;

				// Aid availability (+1 Forward, -1 Team)
				const canSpendTeam = !!teamSvc && teamValue > 0;
				const canForwardLocal =
					canSpendTeam && teamSvc?.canEdit === true && canEditActor(actor) === true;
				const canForwardRelay =
					canSpendTeam && !canForwardLocal && !!game.socket && hasAnyActiveGM();
				const canTeamForward = canForwardLocal || canForwardRelay;

				// Determine what overlay to show
				// If user can mark turn (GM or owner), show Action
				// Otherwise show Aid
				const showAction = canMarkTurn;
				const showAid = !canMarkTurn;

				let actionLabel, actionAction, actionDisabled, actionAria;

				if (showAction) {
					actionLabel = "Action";
					actionAction = "card-action";
					actionDisabled = downed || (!isGM && !readyToAct);
					actionAria = canAction
						? `Mark action taken for ${actor.name}`
						: downed
						? `${actor.name} is downed`
						: `${actor.name} is on cooldown`;
				} else {
					// Show Aid
					actionLabel = "Aid";
					actionAction = "card-aid";
					actionDisabled = !canTeamForward || downed;
					actionAria = canTeamForward
						? `Spend 1 Team to Aid ${actor.name} (+1 Forward)`
						: teamValue <= 0
						? "No Team left to spend"
						: "Aid unavailable";
				}

				const ariaLabelParts = [
					actor?.name ? `Character: ${actor.name}` : "Character",
					downed ? "Downed" : null,
					onCooldown ? `Busy (${remaining} turn(s) remaining)` : "Ready to act",
					`Potential ${potential} of ${POTENTIAL_MAX}`,
				].filter(Boolean);

				const downedId = downed ? `turncard-downed-${cbt.id}` : null;

				return {
					type: "character",
					combatantId: cbt.id,
					actorId: actor.id,
					name: actor.name ?? "UNKNOWN",
					img: actor.img ?? "",

					ariaLabel: ariaLabelParts.join(", "),

					downed,
					downedId,

					onCooldown,
					cooldownFrac: cooldownFrac.toFixed(3),

					potential,
					potentialPct,
					potentialMax: POTENTIAL_MAX,
					canEditPotential: ownsActor,

					status,
					statusLabel,
					showStatusBar: status !== "ready",
					showCooldownBar: onCooldown && maxTurns > 0,

					// Overlay action
					actionAction,
					actionLabel,
					actionDisabled,
					actionAria,

					// Quick spend Team → +1 Forward (separate assist button)
					canTeamForward,

					// Shift Labels (circle)
					canShiftLabels: ownsActor,
				};
			});

			const context = {
				isGM,
				showTeamCard,
				teamSize,
				maxTurns,
				team: teamValue,
				teamCanEdit: teamUiCanEdit || isGM,
				cards,
			};

			const html = await renderTemplate(
				`modules/${NS}/templates/turncards.hbs`,
				context
			);
			this.root.innerHTML = html;

			// Setup context menu after render
			this._setupContextMenu();
		},
	};

	Hooks.once("ready", () => {
		try {
			TurnCardsHUD.mount();
		} catch (err) {
			console.error(`[${NS}] Failed to mount turn cards HUD`, err);
		}
	});
})();
