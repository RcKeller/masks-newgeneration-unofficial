// module/turn-cards.mjs
/* global Hooks, game, ui, foundry, renderTemplate, ChatMessage, CONST, canvas, Dialog, ContextMenu */

import { normalize, candidateTokenNames, compositeKey, InfluenceIndex } from "./helpers/influence.mjs";

(() => {
	const NS = "masks-newgeneration-unofficial";
	const SOCKET_NS = "module.masks-newgeneration-unofficial";
	const FLAG_COOLDOWN_MAP = "turnCardsCooldownMap";
	const FLAG_POTENTIAL_FALLBACK = "turnCardsPotential";
	const POTENTIAL_MAX = 5;
	const AID_MOVE_UUID = "@UUID[Compendium.masks-newgeneration-unofficial.moves.H7mJLUYVlQ3ZPGHK]{Aid a Teammate}";
	const LABEL_KEYS = Object.freeze(["danger", "freak", "savior", "superior", "mundane"]);

	const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(Number(n) || lo)));
	const escape = (s) => foundry.utils.escapeHTML(String(s ?? ""));
	const getProp = (obj, path) => foundry.utils.getProperty(obj, path);
	const getActiveCombat = () => game.combats?.active ?? ui.combat?.viewed ?? null;
	const getTeamCombatants = (combat) => (combat?.combatants?.contents ?? []).filter((c) => c?.actor?.type === "character");
	const hasActiveGM = () => (game.users?.contents ?? []).some((u) => u?.isGM && u?.active);
	const isGM = () => game.user?.isGM === true;
	const canEdit = (actor) => isGM() || actor?.isOwner === true;

	function isDowned(cbt) {
		if (cbt?.defeated) return true;
		const hp = Number(getProp(cbt?.actor, "system.attributes.hp.value"));
		return Number.isFinite(hp) && hp <= 0;
	}

	function getMyActor() {
		if (game.user?.character) return game.user.character;
		const tok = (canvas?.tokens?.placeables ?? []).find((t) => t?.actor?.isOwner);
		return tok?.actor ?? null;
	}

	function getPotential(actor) {
		const xp = Number(getProp(actor, "system.attributes.xp.value"));
		if (Number.isFinite(xp)) return clamp(xp, 0, POTENTIAL_MAX);
		const flag = Number(actor?.getFlag?.(NS, FLAG_POTENTIAL_FALLBACK));
		return Number.isFinite(flag) ? clamp(flag, 0, POTENTIAL_MAX) : 0;
	}

	async function setPotential(actor, val) {
		val = clamp(val, 0, POTENTIAL_MAX);
		const hasXp = getProp(actor, "system.attributes.xp") !== undefined;
		try {
			if (hasXp) await actor.update({ "system.attributes.xp.value": val });
			else await actor.setFlag(NS, FLAG_POTENTIAL_FALLBACK, val);
		} catch (e) { console.error(`[${NS}]`, e); ui.notifications?.warn?.("Cannot change Potential."); }
	}

	const getForward = (actor) => Number(getProp(actor, "system.resources.forward.value")) || 0;
	const getOngoing = (actor) => Number(getProp(actor, "system.resources.ongoing.value")) || 0;

	function shiftBounds() {
		const min = Number(game.pbta?.sheetConfig?.minMod), max = Number(game.pbta?.sheetConfig?.maxMod);
		return { lo: Number.isFinite(min) ? min : -2, hi: Number.isFinite(max) ? max : 3 };
	}

	function statLabel(actor, key) {
		return getProp(actor, `system.stats.${key}.label`) || game.pbta?.sheetConfig?.actorTypes?.character?.stats?.[key]?.label || key.charAt(0).toUpperCase() + key.slice(1);
	}

	const getLabelValue = (actor, key) => Number(getProp(actor, `system.stats.${key}.value`)) || 0;

	function getShiftableLabels(actor) {
		const { lo, hi } = shiftBounds();
		const up = [], down = [];
		for (const k of LABEL_KEYS) { const v = getLabelValue(actor, k); if (v < hi) up.push(k); if (v > lo) down.push(k); }
		return { canShiftUp: up, canShiftDown: down };
	}

	async function promptShiftLabels(actor, title) {
		const { canShiftUp, canShiftDown } = getShiftableLabels(actor);
		if (!canShiftUp.length || !canShiftDown.length) { ui.notifications?.warn?.("No valid label shifts."); return null; }
		const labels = LABEL_KEYS.map((k) => ({ key: k, label: statLabel(actor, k), value: getLabelValue(actor, k) }));
		const { lo, hi } = shiftBounds();
		const makeOpts = (arr, check, limit, suffix) => labels.map((l) => {
			const disabled = !arr.includes(l.key), atLimit = check(l.value, limit), suf = atLimit ? ` (at ${suffix} ${limit})` : "";
			return `<option value="${l.key}" ${disabled ? "disabled" : ""}>${escape(l.label)} [${l.value}]${suf}</option>`;
		}).join("");
		const optsUp = makeOpts(canShiftUp, (v, h) => v >= h, hi, "max");
		const optsDown = makeOpts(canShiftDown, (v, l) => v <= l, lo, "min");
		const content = `<form><p style="margin:0 0 .5rem 0;">Choose one Label to shift <b>up</b> and one <b>down</b>.</p><div class="form-group"><label>Shift up (+1):</label><select name="up">${optsUp}</select></div><div class="form-group"><label>Shift down (-1):</label><select name="down">${optsDown}</select></div><p class="notes" style="margin:.35rem 0 0 0;opacity:.8;">(They must be different.)</p></form>`;
		return new Promise((resolve) => {
			new Dialog({
				title: title ?? `Shift Labels: ${actor?.name ?? "Character"}`, content,
				buttons: {
					ok: { label: "Shift", callback: (html) => {
						const up = html[0]?.querySelector("select[name='up']")?.value, down = html[0]?.querySelector("select[name='down']")?.value;
						if (!up || !down || up === down) { if (up === down) ui.notifications?.warn?.("Choose two different Labels."); return resolve(null); }
						if (!canShiftUp.includes(up) || !canShiftDown.includes(down)) { ui.notifications?.warn?.("Invalid selection."); return resolve(null); }
						resolve({ up, down });
					}},
					cancel: { label: "Cancel", callback: () => resolve(null) }
				},
				default: "ok", close: () => resolve(null),
				render: (html) => {
					const upSel = html[0]?.querySelector("select[name='up']"), downSel = html[0]?.querySelector("select[name='down']");
					if (upSel) upSel.value = canShiftUp[0] || LABEL_KEYS[0];
					if (downSel) downSel.value = canShiftDown.find((k) => k !== canShiftUp[0]) || canShiftDown[0] || LABEL_KEYS[1];
				}
			}).render(true);
		});
	}

	async function applyShiftLabels(actor, upKey, downKey, { announce = true, reason = "shift", sourceActor = null } = {}) {
		const { lo, hi } = shiftBounds();
		const p = (k) => `system.stats.${k}.value`;
		const curUp = getLabelValue(actor, upKey), curDown = getLabelValue(actor, downKey);
		if (curUp >= hi || curDown <= lo) { ui.notifications?.warn?.("Labels at limits."); return false; }
		try { await actor.update({ [p(upKey)]: curUp + 1, [p(downKey)]: curDown - 1 }); } catch (e) { console.error(`[${NS}]`, e); return false; }
		if (announce) {
			const upLabel = statLabel(actor, upKey), downLabel = statLabel(actor, downKey), name = escape(actor.name);
			let content = reason === "useInfluence" && sourceActor ? `<b>${escape(sourceActor.name)}</b> uses Influence to shift <b>${name}</b>'s Labels: ` : `<b>${name}</b> shifts their Labels: `;
			content += `<span class="shift up">+${escape(upLabel)}</span>, <span class="shift down">-${escape(downLabel)}</span>`;
			await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
		}
		return true;
	}

	const TeamService = {
		_doc: null,
		async _getDoc(create = false) {
			if (this._doc && game.journal?.has(this._doc.id)) return this._doc;
			const storedId = game.settings.get(NS, "teamDocId");
			if (storedId) { const found = game.journal?.get(storedId); if (found) return (this._doc = found); }
			const byFlag = game.journal?.find((j) => j.getFlag(NS, "isTeamDoc"));
			if (byFlag) { await game.settings.set(NS, "teamDocId", byFlag.id); return (this._doc = byFlag); }
			const byName = game.journal?.find((j) => j.name === "MASKS • Team Pool");
			if (byName) { if (isGM()) await byName.setFlag(NS, "isTeamDoc", true); await game.settings.set(NS, "teamDocId", byName.id); return (this._doc = byName); }
			if (create && isGM()) {
				const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
				const doc = await JournalEntry.create({ name: "MASKS • Team Pool", pages: [], ownership: { default: OWNER }, flags: { [NS]: { isTeamDoc: true, team: 0 } } }, { renderSheet: false });
				await game.settings.set(NS, "teamDocId", doc.id);
				return (this._doc = doc);
			}
			return null;
		},
		async init() { this._doc = await this._getDoc(); },
		async ensureReady() {
			if (!isGM()) return;
			const doc = await this._getDoc(true);
			if (!doc) return;
			const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
			if ((doc.ownership?.default ?? 0) !== OWNER) await doc.update({ ownership: { ...doc.ownership, default: OWNER } });
		},
		get canEdit() { return isGM() || (game.settings.get(NS, "playersCanEdit") && this._doc?.isOwner); },
		get value() { const v = Number(this._doc?.getFlag?.(NS, "team")); return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0; },
		async change(delta, opts = {}) { return this.set(this.value + delta, { ...opts, delta }); },
		async set(n, { announce = true, reason = null, actorName = null, delta = null } = {}) {
			n = Math.max(0, Math.floor(Number(n) || 0));
			this._doc ??= await this._getDoc();
			if (!this._doc) { ui.notifications?.warn?.("Team Pool not initialized."); return; }
			if (!this.canEdit && !isGM()) { ui.notifications?.warn?.("No permission to edit Team."); return; }
			const old = this.value; if (n === old) return;
			await this._doc.setFlag(NS, "team", n);
			if (announce && game.settings.get(NS, "announceChanges")) {
				const d = delta ?? n - old, sign = d > 0 ? "+" : "", from = game.user?.name ?? "Player";
				let content;
				if (reason === "aid" && actorName) content = `<b>${escape(from)}</b> spends 1 Team to aid <b>${escape(actorName)}</b>!<br/>Team Pool: ${old} → <b>${n}</b><br/>${AID_MOVE_UUID}`;
				else content = `<b>Team Pool</b>: ${old} → <b>${n}</b> (${sign}${d}) <span class="color-muted">— ${escape(from)}</span>`;
				await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
			}
			Hooks.callAll("masksTeamUpdated");
		}
	};
	globalThis.MasksTeam = TeamService;

	function readInfluences(actor) { return foundry.utils.deepClone(actor?.getFlag?.(NS, "influences") || []); }
	function pickStorageName(actor, token) { const cands = candidateTokenNames(actor, token); return cands[0] || actor?.name || token?.document?.name || "Unknown"; }
	function ensureInfluenceEntry(arr, name) {
		const want = normalize(name);
		let idx = arr.findIndex((e) => normalize(e?.name) === want);
		if (idx >= 0) return { idx, obj: arr[idx] };
		const obj = { id: foundry.utils.randomID?.(16) ?? Math.random().toString(36).slice(2), name, hasInfluenceOver: false, haveInfluenceOver: false, locked: false };
		arr.push(obj);
		return { idx: arr.length - 1, obj };
	}
	function mutateInfluenceSide(arr, name, which) {
		const { idx, obj } = ensureInfluenceEntry(arr, name);
		const prev = { has: !!obj.hasInfluenceOver, have: !!obj.haveInfluenceOver };
		if (obj.locked && which !== "reset") return { changed: false, prev, now: prev, pruned: false };
		if (which === "gt") obj.haveInfluenceOver = true;
		else if (which === "lt") obj.hasInfluenceOver = true;
		else if (which === "eq") { obj.haveInfluenceOver = true; obj.hasInfluenceOver = true; }
		else { obj.haveInfluenceOver = false; obj.hasInfluenceOver = false; }
		let pruned = false;
		if (!obj.hasInfluenceOver && !obj.haveInfluenceOver && !obj.locked) { arr.splice(idx, 1); pruned = true; }
		return { changed: prev.has !== !!obj.hasInfluenceOver || prev.have !== !!obj.haveInfluenceOver || pruned, prev, now: { has: !!obj.hasInfluenceOver, have: !!obj.haveInfluenceOver }, pruned };
	}
	function stateSymbol(e) {
		const out = !!e?.haveInfluenceOver, inn = !!e?.hasInfluenceOver;
		if (out && inn) return "⬌"; if (out) return "⬆"; if (inn) return "⬇"; return "x";
	}
	async function writeInfluencesIfChanged(actor, before, after) {
		const eq = before.length === after.length && before.every((a, i) => {
			const b = after[i]; return a && b && normalize(a.name) === normalize(b.name) && !!a.hasInfluenceOver === !!b.hasInfluenceOver && !!a.haveInfluenceOver === !!b.haveInfluenceOver && !!a.locked === !!b.locked;
		});
		if (eq) return false;
		await actor.setFlag(NS, "influences", after);
		return true;
	}
	async function announceInfluenceChange(srcName, tgtName, beforeSym, afterSym) {
		if (!game.settings.get(NS, "announceInfluenceChanges")) return;
		const badge = (s) => { const css = "display:inline-block;padding:0 .35rem;border-radius:.25rem;font-weight:700;"; if (s === "⬆") return `<span style="${css}background:#4CAF50;color:#fff">${s}</span>`; if (s === "⬇") return `<span style="${css}background:#9C27B0;color:#fff">${s}</span>`; if (s === "⬌") return `<span style="${css}background:#2196F3;color:#fff">${s}</span>`; return `<span style="${css}background:#F44336;color:#fff">${s}</span>`; };
		let title; switch (afterSym) { case "⬆": title = `${srcName} gains Influence over ${tgtName}`; break; case "⬇": title = `${srcName} gives Influence to ${tgtName}`; break; case "⬌": title = `${srcName} and ${tgtName} share Influence`; break; default: title = `${srcName} and ${tgtName} do not share Influence`; }
		let content = `<h6>${badge(afterSym)} ${title}</h6>`;
		if (beforeSym !== "x" && beforeSym !== afterSym) content += `<b>Previous:</b> <em>${srcName}</em> ${badge(beforeSym)} <em>${tgtName}</em>`;
		await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
	}
	async function applyInfluencePair({ actorA, tokA, actorB, tokB, directive }) {
		if (!actorA || !actorB || actorA.type !== "character" || actorB.type !== "character") { ui.notifications?.warn?.("Influence actions are for Character ↔ Character."); return; }
		const aBefore = readInfluences(actorA), bBefore = readInfluences(actorB);
		const aAfter = foundry.utils.deepClone(aBefore), bAfter = foundry.utils.deepClone(bBefore);
		const nameAforB = pickStorageName(actorA, tokA), nameBforA = pickStorageName(actorB, tokB);
		const stA = mutateInfluenceSide(aAfter, nameBforA, directive);
		const aPrevSym = stateSymbol({ hasInfluenceOver: stA.prev.has, haveInfluenceOver: stA.prev.have });
		const aNowSym = stateSymbol({ hasInfluenceOver: stA.now.has, haveInfluenceOver: stA.now.have });
		let whichB = "reset"; if (directive === "gt") whichB = "lt"; else if (directive === "lt") whichB = "gt"; else if (directive === "eq") whichB = "eq";
		mutateInfluenceSide(bAfter, nameAforB, whichB);
		const tasks = [];
		if (canEdit(actorA)) tasks.push(writeInfluencesIfChanged(actorA, aBefore, aAfter));
		if (canEdit(actorB)) tasks.push(writeInfluencesIfChanged(actorB, bBefore, bAfter));
		try { await Promise.all(tasks); } catch (e) { console.error(`[${NS}]`, e); ui.notifications?.error?.("Couldn't update Influence."); return; }
		try { await InfluenceIndex?.syncCharacterPairFlags?.(actorA); } catch (_) {}
		await announceInfluenceChange(actorA.name ?? nameAforB, nameBforA, aPrevSym, aNowSym);
	}

	const TurnCardsHUD = {
		root: null, _hooksRegistered: false, _socketRegistered: false, _contextMenu: null, _renderQueued: false,

		mount() {
			const host = document.querySelector("#ui-middle #ui-bottom") || document.querySelector("#ui-bottom") || document.querySelector("#ui-middle") || document.body;
			this.root?.remove();
			this.root = document.createElement("section");
			this.root.id = "masks-turncards";
			this.root.setAttribute("role", "group");
			this.root.setAttribute("aria-label", "Team Turn Cards");
			host.appendChild(this.root);
			this._bindEvents();
			this._registerHooks();
			this._initSocket();
			TeamService.ensureReady().then(() => TeamService.init());
			if (isGM()) this.normalizeCooldowns().finally(() => this._queueRender());
			else this._queueRender();
		},

		_bindEvents() {
			if (!this.root || this.root.dataset.bound === "1") return;
			this.root.dataset.bound = "1";
			this.root.addEventListener("click", (ev) => this._onClick(ev), { capture: true });
			this.root.addEventListener("contextmenu", (ev) => this._onRightClick(ev), { capture: true });
			this.root.addEventListener("keydown", (ev) => {
				if (ev.key === "Enter" || ev.key === " ") {
					const card = ev.target?.closest?.(".turncard[data-combatant-id]:not(.turncard--team)");
					if (card && !ev.target.closest("button")) { ev.preventDefault(); card.click(); }
				}
			});
		},

		async _onClick(ev) {
			const target = ev.target instanceof HTMLElement ? ev.target : null;
			if (!target) return;
			const btn = target.closest("[data-action]");
			if (btn) { ev.preventDefault(); ev.stopPropagation(); await this._handleAction(btn.dataset.action, btn, ev); return; }
			const card = target.closest(".turncard[data-combatant-id]:not(.turncard--team)");
			if (card) { const combat = getActiveCombat(); const cbt = combat?.combatants?.get?.(card.dataset.combatantId); cbt?.actor?.sheet?.render?.(true); }
		},

		async _onRightClick(ev) {
			const target = ev.target instanceof HTMLElement ? ev.target : null;
			if (!target) return;
			const potBtn = target.closest("[data-action='potential']");
			if (potBtn) { ev.preventDefault(); ev.stopPropagation(); await this._handlePotential(potBtn, -1); return; }
			const fwdBtn = target.closest("[data-action='forward']");
			if (fwdBtn) { ev.preventDefault(); ev.stopPropagation(); await this._handleForward(fwdBtn, -1); return; }
		},

		async _handleAction(action, el, ev) {
			switch (action) {
				case "potential": await this._handlePotential(el, +1); break;
				case "forward": await this._handleForward(el, +1); break;
				case "team-action": if (isGM()) await this.advanceCooldowns(null); else this._socketEmit({ action: "turnCardsGmTurn" }); break;
				case "card-action": await this._handleCardAction(el.dataset.combatantId); break;
				case "shift-labels": await this._handleShiftLabels(el.dataset.actorId); break;
				case "team-minus": await this._handleTeamChange(ev.shiftKey ? -5 : -1); break;
				case "team-plus": await this._handleTeamChange(ev.shiftKey ? 5 : 1); break;
				case "team-reset": if (isGM() || TeamService.canEdit) await TeamService.set(0); else ui.notifications?.warn?.("Only GM can reset Team."); break;
			}
		},

		async _handlePotential(el, delta) {
			const actor = game.actors?.get?.(el.dataset.actorId);
			if (!actor || !canEdit(actor)) { ui.notifications?.warn?.("Can't change Potential."); return; }
			const cur = getPotential(actor), next = clamp(cur + delta, 0, POTENTIAL_MAX);
			if (next !== cur) { await setPotential(actor, next); el.classList.remove("is-bump"); void el.offsetHeight; el.classList.add("is-bump"); }
		},

		async _handleForward(el, delta) {
			const targetActor = game.actors?.get?.(el.dataset.actorId);
			if (!targetActor) return;
			const myActor = getMyActor(), isSelf = myActor && myActor.id === targetActor.id;
			const combat = getActiveCombat(), cbt = getTeamCombatants(combat).find((c) => c.actor?.id === targetActor.id);
			if (cbt && isDowned(cbt) && !isSelf && !isGM()) { ui.notifications?.warn?.("Cannot aid downed character."); return; }
			if (delta < 0) {
				if (!isSelf && !isGM()) { ui.notifications?.warn?.("Can only remove Forward from self."); return; }
				if (!canEdit(targetActor)) { ui.notifications?.warn?.("Can't edit that character."); return; }
				await this._applyForwardChange(targetActor, delta, false);
				return;
			}
			if (isSelf || isGM()) { await this._applyForwardChange(targetActor, delta, false); }
			else {
				const teamVal = TeamService.value;
				if (teamVal < 1) { ui.notifications?.warn?.("Not enough Team to aid (requires 1)."); return; }
				if (TeamService.canEdit && canEdit(targetActor)) {
					await TeamService.change(-1, { announce: true, reason: "aid", actorName: targetActor.name });
					await this._applyForwardChange(targetActor, 1, true);
				} else if (hasActiveGM()) {
					this._socketEmit({ action: "turnCardsAidTeammate", targetActorId: targetActor.id, sourceActorId: myActor?.id });
				} else { ui.notifications?.warn?.("GM must be online to aid."); }
			}
		},

		async _applyForwardChange(actor, delta, isAid = false) {
			const cur = getForward(actor), next = Math.max(0, cur + delta);
			if (next === cur) return;
			try {
				await actor.update({ "system.resources.forward.value": next });
				const name = escape(actor.name), sign = delta > 0 ? "+" : "";
				let content = isAid ? `<b>${name}</b> gains <b>+1 Forward</b> (now ${next}).` : `<b>${name}</b>: Forward ${cur} → <b>${next}</b> (${sign}${delta})`;
				await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
			} catch (e) { console.error(`[${NS}]`, e); ui.notifications?.error?.("Couldn't update Forward."); }
		},

		async _handleCardAction(combatantId) {
			if (!combatantId) return;
			if (isGM()) { await this._gmHandleMarkTurn(combatantId); }
			else { this._socketEmit({ action: "turnCardsMark", visibleCombatantId: combatantId }); }
		},

		async _handleShiftLabels(actorId) {
			const actor = game.actors?.get?.(actorId);
			if (!actor) return;
			if (!canEdit(actor)) { ui.notifications?.warn?.("Can't shift Labels."); return; }
			const { canShiftUp, canShiftDown } = getShiftableLabels(actor);
			if (!canShiftUp.length || !canShiftDown.length) { ui.notifications?.warn?.("No valid shifts."); return; }
			const picked = await promptShiftLabels(actor, `Shift Labels: ${actor.name}`);
			if (picked) await applyShiftLabels(actor, picked.up, picked.down, { announce: true, reason: "shift" });
		},

		async _handleTeamChange(delta) {
			if (isGM() || TeamService.canEdit) await TeamService.change(delta);
			else this._socketEmit({ action: "turnCardsTeamChange", delta });
		},

		async _gmHandleMarkTurn(combatantId) {
			const combat = getActiveCombat();
			if (!combat) return;
			const cbt = combat.combatants?.get?.(combatantId);
			if (!cbt) return;
			await this.onActorTurn(cbt.actor?.id);
			await this.advanceCooldowns(cbt.actor?.id);
		},

		_socketEmit(data) { try { game.socket?.emit(SOCKET_NS, data); } catch (e) { console.warn(`[${NS}] Socket emit failed`, e); } },

		_registerHooks() {
			if (this._hooksRegistered) return;
			this._hooksRegistered = true;
			Hooks.on("createCombat", () => this._queueRender());
			Hooks.on("deleteCombat", () => this._queueRender());
			Hooks.on("updateCombat", (doc, changes) => {
				const active = getActiveCombat(), isRelevant = doc?.id && active?.id && doc.id === active.id;
				const flagChanged = getProp(changes, `flags.${NS}.${FLAG_COOLDOWN_MAP}`) !== undefined;
				const turnChanged = Object.prototype.hasOwnProperty.call(changes ?? {}, "turn");
				if (turnChanged && isRelevant && isGM()) { this.advanceCooldowns(null).finally(() => this._queueRender()); return; }
				const roundChanged = Object.prototype.hasOwnProperty.call(changes ?? {}, "round");
				if (roundChanged && isRelevant) { this._queueRender(); return; }
				if (flagChanged || doc?.active === true || isRelevant || Object.prototype.hasOwnProperty.call(changes ?? {}, "active")) this._queueRender();
			});
			Hooks.on("createCombatant", (cbt) => { if (cbt?.combat?.id !== getActiveCombat()?.id) return; if (isGM()) this.normalizeCooldowns().finally(() => this._queueRender()); else this._queueRender(); });
			Hooks.on("deleteCombatant", (cbt) => { if (cbt?.combat?.id !== getActiveCombat()?.id) return; if (isGM()) this.normalizeCooldowns().finally(() => this._queueRender()); else this._queueRender(); });
			Hooks.on("updateCombatant", (doc, changes) => { if (doc?.combat?.id !== getActiveCombat()?.id) return; if (Object.prototype.hasOwnProperty.call(changes ?? {}, "defeated")) this._queueRender(); });
			Hooks.on("updateActor", (_actor, changes) => {
				const paths = ["system.attributes.xp.value", "system.resources.forward.value", "system.resources.ongoing.value", "system.attributes.hp.value", "system.stats", `flags.${NS}.${FLAG_POTENTIAL_FALLBACK}`];
				if (paths.some((p) => getProp(changes, p) !== undefined) || changes?.img !== undefined || changes?.name !== undefined) this._queueRender();
			});
			Hooks.on("updateJournalEntry", (doc) => { if (TeamService._doc && doc.id === TeamService._doc.id) this._queueRender(); });
			Hooks.on("canvasReady", () => { if (!document.getElementById("masks-turncards")) this.mount(); else this._queueRender(); });
			Hooks.on("masksTeamUpdated", () => this._queueRender());
		},

		_initSocket() {
			if (this._socketRegistered) return;
			this._socketRegistered = true;
			try {
				game.socket?.on(SOCKET_NS, async (data) => {
					if (!data?.action || !isGM()) return;
					switch (data.action) {
						case "turnCardsMark": if (data.visibleCombatantId) await this._gmHandleMarkTurn(data.visibleCombatantId); break;
						case "turnCardsGmTurn": await this.advanceCooldowns(null); break;
						case "turnCardsAidTeammate": {
							const { targetActorId, sourceActorId } = data;
							if (!targetActorId) return;
							const target = game.actors?.get?.(targetActorId);
							if (!target) return;
							await TeamService.change(-1, { announce: true, reason: "aid", actorName: target.name });
							await this._applyForwardChange(target, 1, true);
							break;
						}
						case "turnCardsTeamChange": if (data.delta) await TeamService.change(data.delta); break;
						case "turnCardsShiftLabels": {
							const { targetActorId, sourceActorId, up, down, reason } = data;
							if (!targetActorId || !up || !down) return;
							const target = game.actors?.get?.(targetActorId);
							if (!target) return;
							let sourceActor = null;
							if (reason === "useInfluence" && sourceActorId) {
								sourceActor = game.actors?.get?.(sourceActorId);
								if (!sourceActor || !InfluenceIndex.hasEdgeFromKeyToKey(compositeKey(sourceActor), compositeKey(target))) return;
							}
							await applyShiftLabels(target, up, down, { announce: true, reason, sourceActor });
							break;
						}
					}
				});
			} catch (e) { console.warn(`[${NS}] Socket unavailable`, e); }
		},

		_queueRender() {
			if (this._renderQueued) return;
			this._renderQueued = true;
			setTimeout(async () => { try { await this.render(); } finally { this._renderQueued = false; } }, 10);
		},

		_teamSizeAndMaxTurns(combat) {
			const team = getTeamCombatants(combat);
			return { team, size: team.length, maxTurns: Math.max(0, team.length - 1) };
		},

		_readCooldownMap(combat) {
			const raw = combat?.getFlag?.(NS, FLAG_COOLDOWN_MAP);
			return raw && typeof raw === "object" ? foundry.utils.deepClone(raw) : {};
		},

		async _writeCooldownMap(combat, map) {
			if (!combat) return;
			try {
				if (!Object.keys(map || {}).length) await combat.unsetFlag(NS, FLAG_COOLDOWN_MAP);
				else await combat.setFlag(NS, FLAG_COOLDOWN_MAP, map);
			} catch (e) { console.warn(`[${NS}] Failed to write cooldown map`, e); }
		},

		_getCooldown(map, combatantId, maxTurns) {
			const raw = Number(map?.[combatantId] ?? NaN);
			return Number.isFinite(raw) ? Math.min(Math.max(0, Math.floor(raw)), maxTurns) : 0;
		},

		async normalizeCooldowns() {
			const combat = getActiveCombat();
			if (!combat || !isGM()) return;
			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);
			let map = this._readCooldownMap(combat), changed = false;
			if (maxTurns <= 0) { if (Object.keys(map).length) { map = {}; changed = true; } }
			else {
				const ids = new Set(team.map((c) => c.id));
				for (const [id, v] of Object.entries(map)) {
					if (!ids.has(id)) { delete map[id]; changed = true; continue; }
					const n = Math.min(maxTurns, Math.max(0, Math.floor(Number(v) || 0)));
					if (n <= 0) { delete map[id]; changed = true; }
					else if (n !== v) { map[id] = n; changed = true; }
				}
			}
			if (changed) await this._writeCooldownMap(combat, map);
		},

		async onActorTurn(actorId) {
			const combat = getActiveCombat();
			if (!combat || !isGM()) return;
			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);
			if (maxTurns <= 0) { await this.normalizeCooldowns(); return; }
			const acting = team.find((c) => c?.actor?.id === actorId);
			if (!acting) return;
			const map = this._readCooldownMap(combat);
			map[acting.id] = maxTurns;
			await this._writeCooldownMap(combat, map);
		},

		async advanceCooldowns(excludeActorId = null) {
			const combat = getActiveCombat();
			if (!combat || !isGM()) return;
			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);
			if (maxTurns <= 0) { await this.normalizeCooldowns(); return; }
			const map = this._readCooldownMap(combat);
			let changed = false;
			for (const cbt of team) {
				const a = cbt?.actor;
				if (!a || (excludeActorId && a.id === excludeActorId)) continue;
				const cur = this._getCooldown(map, cbt.id, maxTurns);
				if (cur <= 0) continue;
				const next = cur - 1;
				if (next <= 0) delete map[cbt.id];
				else map[cbt.id] = next;
				changed = true;
			}
			if (changed) await this._writeCooldownMap(combat, map);
		},

		_setupContextMenu() {
			const $ = globalThis.jQuery ?? globalThis.$;
			if (!$ || !this.root) return;
			if (this._contextMenu) { try { this._contextMenu.close?.(); } catch (_) {} this._contextMenu = null; }
			const items = [
				{ name: "Gain Influence over", icon: '<i class="fa-solid fa-up"></i>', callback: (li) => this._ctxInfluence(li, "gt") },
				{ name: "Gain Synergy (mutual)", icon: '<i class="fa-solid fa-left-right"></i>', callback: (li) => this._ctxInfluence(li, "eq") },
				{ name: "Give Influence to", icon: '<i class="fa-solid fa-down"></i>', callback: (li) => this._ctxInfluence(li, "lt") },
				{ name: "Use Influence against…", icon: '<i class="fa-solid fa-bullseye"></i>', callback: (li) => this._ctxUseInfluence(li) },
			];
			try { this._contextMenu = new ContextMenu($(this.root), ".turncard[data-actor-id]:not(.turncard--team)", items); } catch (e) { console.warn(`[${NS}] ContextMenu failed`, e); }
		},

		_liEl(li) { if (!li) return null; if (li instanceof HTMLElement) return li; if (Array.isArray(li) && li[0] instanceof HTMLElement) return li[0]; return li?.[0] instanceof HTMLElement ? li[0] : null; },

		async _resolveSource() {
			const ctrl = canvas?.tokens?.controlled ?? [];
			if (ctrl.length === 1 && ctrl[0]?.actor) return { token: ctrl[0], actor: ctrl[0].actor };
			const my = game.user?.character;
			if (my) { const tok = (canvas.tokens?.placeables ?? []).find((t) => t?.actor?.id === my.id) || null; return { token: tok, actor: my }; }
			const owned = (canvas.tokens?.placeables ?? []).find((t) => t.actor?.isOwner);
			if (owned) return { token: owned, actor: owned.actor };
			ui.notifications?.warn?.("Select your character token or set User Character.");
			return null;
		},

		async _ctxInfluence(li, directive) {
			const el = this._liEl(li), targetActorId = el?.dataset?.actorId;
			if (!targetActorId) return;
			const targetActor = game.actors?.get?.(targetActorId);
			if (!targetActor) return;
			const src = await this._resolveSource();
			if (!src?.actor || src.actor.id === targetActor.id) { ui.notifications?.warn?.("Pick another card."); return; }
			const tgtTok = (canvas.tokens?.placeables ?? []).find((t) => t?.actor?.id === targetActor.id) || null;
			await applyInfluencePair({ actorA: src.actor, tokA: src.token, actorB: targetActor, tokB: tgtTok, directive });
		},

		async _ctxUseInfluence(li) {
			const el = this._liEl(li), targetActorId = el?.dataset?.actorId;
			if (!targetActorId) return;
			const targetActor = game.actors?.get?.(targetActorId);
			if (!targetActor) return;
			const src = await this._resolveSource();
			if (!src?.actor || src.actor.id === targetActor.id) { ui.notifications?.warn?.("Can't use Influence against yourself."); return; }
			if (!InfluenceIndex.hasEdgeFromKeyToKey(compositeKey(src.actor), compositeKey(targetActor))) { ui.notifications?.warn?.(`No Influence over ${targetActor.name}.`); return; }
			const picked = await promptShiftLabels(targetActor, `Use Influence on: ${targetActor.name}`);
			if (!picked) return;
			if (canEdit(targetActor)) await applyShiftLabels(targetActor, picked.up, picked.down, { announce: true, reason: "useInfluence", sourceActor: src.actor });
			else if (hasActiveGM()) this._socketEmit({ action: "turnCardsShiftLabels", targetActorId: targetActor.id, sourceActorId: src.actor.id, up: picked.up, down: picked.down, reason: "useInfluence" });
			else ui.notifications?.warn?.("A GM must be online.");
		},

		async render() {
			if (!this.root) return;
			const combat = getActiveCombat();
			if (!combat) { this.root.style.display = "none"; this.root.innerHTML = ""; return; }
			const { team, size: teamSize, maxTurns } = this._teamSizeAndMaxTurns(combat);
			if (!team.length) { this.root.style.display = "none"; this.root.innerHTML = ""; return; }
			this.root.style.display = "";
			await TeamService.init();
			const teamValue = TeamService.value, teamCanEdit = TeamService.canEdit || isGM(), cooldownMap = this._readCooldownMap(combat);
			const myActor = getMyActor(), myActorId = myActor?.id ?? null;

			const cards = team.map((cbt) => {
				const actor = cbt.actor, ownsActor = canEdit(actor), downed = isDowned(cbt), isSelf = myActorId && actor.id === myActorId;
				const remaining = this._getCooldown(cooldownMap, cbt.id, maxTurns), onCooldown = remaining > 0 && maxTurns > 0;
				const cooldownFrac = onCooldown && maxTurns > 0 ? Math.max(0, Math.min(1, remaining / maxTurns)) : 0;
				const potential = getPotential(actor), potentialPct = POTENTIAL_MAX > 0 ? `${Math.round((potential / POTENTIAL_MAX) * 100)}%` : "0%";
				const forward = getForward(actor), ongoing = getOngoing(actor), effectiveBonus = forward + ongoing;
				const status = downed ? "down" : onCooldown ? "busy" : "ready";
				const canAid = !isSelf && teamValue >= 1 && !downed;
				const forwardDisabled = !isSelf && !isGM() && (!canAid);
				const showActionBtn = !downed && !onCooldown && (isGM() || ownsActor);
				return {
					type: "character", combatantId: cbt.id, actorId: actor.id, name: actor.name ?? "UNKNOWN", img: actor.img ?? "",
					ariaLabel: [actor.name, downed ? "Downed" : null, onCooldown ? `Cooldown (${remaining})` : "Ready", `Potential ${potential}/${POTENTIAL_MAX}`].filter(Boolean).join(", "),
					downed, downedId: downed ? `turncard-downed-${cbt.id}` : null,
					onCooldown, cooldownFrac: cooldownFrac.toFixed(3), remaining,
					potential, potentialPct, potentialMax: POTENTIAL_MAX, canEditPotential: ownsActor,
					forward, ongoing, effectiveBonus, hasBonus: effectiveBonus > 0, forwardDisabled, forwardTooltip: isSelf ? `Forward: ${forward} | Ongoing: ${ongoing}` : canAid ? `Aid ${actor.name}: Spend 1 Team` : "Cannot aid",
					status, statusTooltip: `Cooldown: ${remaining} turn(s)`, showStatusBar: onCooldown,
					showActionBtn, actionAria: showActionBtn ? `Mark action for ${actor.name}` : "", canShiftLabels: ownsActor, isOwner: ownsActor, isSelf
				};
			});

			const context = { isGM: isGM(), showTeamCard: true, teamSize, maxTurns, team: teamValue, teamCanEdit, cards };
			const html = await renderTemplate(`modules/${NS}/templates/turncards.hbs`, context);
			this.root.innerHTML = html;
			this._setupContextMenu();
		}
	};

	Hooks.once("ready", () => { try { TurnCardsHUD.mount(); } catch (e) { console.error(`[${NS}] Failed to mount TurnCardsHUD`, e); } });
})();
