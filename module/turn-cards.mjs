/* global Hooks, game, ui, foundry, renderTemplate, ChatMessage, CONST, canvas, Dialog, ContextMenu */

import {
  normalize,
  candidateTokenNames,
  compositeKey,
  InfluenceIndex
} from "./helpers/influence.mjs";

/**
 * masks-newgeneration-unofficial / turn-cards.mjs
 * ----------------------------------------------------------------------------
 * Team Turn Cards HUD:
 * - Shows playable Characters (actor.type === "character") in the active Combat.
 * - Cooldown = "can't act again until all other PCs have acted":
 *   remainingTurns = (teamSize - 1) after acting.
 *   Each subsequent turn by another PC or the GM card decrements remainingTurns by 1.
 *
 * IMPORTANT CHANGE (bugfix):
 * - Cooldowns are stored on the Combat document flags (not Combatants),
 *   so all players can SEE "Busy" even when they don't own/control that combatant.
 *
 * Other additions:
 * - If you can't "Action" as that character, you get an "Aid" overlay (spend Team → give +1 Forward).
 * - Right-click on a character card opens a Foundry context menu for Influence actions.
 * - Clicking the circle opens a Shift Labels prompt (1 up, 1 down).
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
  const KEY_ANNOUNCE_INFLUENCE = "announceInfluenceChanges"; // world
  const KEY_USE_GM_INFLUENCE = "quickInfluenceUseGMRelay";   // world

  const LABEL_KEYS = Object.freeze(["danger", "freak", "savior", "superior", "mundane"]);

  /**
   * Clamp a number to an integer within [lo, hi].
   */
  const clampInt = (n, lo, hi) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return lo;
    return Math.min(hi, Math.max(lo, Math.floor(x)));
  };

  function getActiveCombat() {
    // Prefer the active combat; fallback to viewed tracker combat
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
    // Prefer the system XP track if it exists (Masks labels this “Potential” already)
    const xpVal = Number(foundry?.utils?.getProperty?.(actor, "system.attributes.xp.value"));
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
      ui.notifications?.warn?.("You don’t have permission to change that character’s Potential.");
    }
  }

  function isDowned(cbt) {
    // Prefer explicit defeated flags or HP <= 0
    const defeated = cbt?.defeated === true;
    const hp = Number(foundry?.utils?.getProperty?.(cbt?.actor, "system.attributes.hp.value"));
    const hpZero = Number.isFinite(hp) && hp <= 0;
    return defeated || hpZero;
  }

  function statLabel(actor, key) {
    return (
      foundry.utils.getProperty(actor, `system.stats.${key}.label`) ||
      game.pbta?.sheetConfig?.actorTypes?.character?.stats?.[key]?.label ||
      key
    );
  }

  function shiftBounds() {
    // Prefer PbtA sheet config bounds if present, else default Masks-ish bounds.
    const min = Number(game.pbta?.sheetConfig?.minMod);
    const max = Number(game.pbta?.sheetConfig?.maxMod);
    const lo = Number.isFinite(min) ? min : -2;
    const hi = Number.isFinite(max) ? max : 3;
    return { lo, hi };
  }

  async function promptShiftLabels(actor, { title = null } = {}) {
    const labels = LABEL_KEYS.map((k) => ({
      key: k,
      label: String(statLabel(actor, k))
    }));

    const escape = (s) => foundry.utils.escapeHTML(String(s));

    const optsUp = labels
      .map((l, i) => `<option value="${l.key}" ${i === 0 ? "selected" : ""}>${escape(l.label)}</option>`)
      .join("");

    const downDefaultIndex = labels.length > 1 ? 1 : 0;
    const optsDown = labels
      .map((l, i) => `<option value="${l.key}" ${i === downDefaultIndex ? "selected" : ""}>${escape(l.label)}</option>`)
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
      // eslint-disable-next-line no-new
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
            }
          },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "ok",
        close: () => resolve(null)
      }).render(true);
    });
  }

  async function applyShiftLabels(actor, upKey, downKey) {
    if (!actor) return false;
    const { lo, hi } = shiftBounds();

    const p = (k) => `system.stats.${k}.value`;
    const curUp = Number(foundry.utils.getProperty(actor, p(upKey)));
    const curDown = Number(foundry.utils.getProperty(actor, p(downKey)));

    if (!Number.isFinite(curUp) || !Number.isFinite(curDown)) {
      ui.notifications?.warn?.("This actor doesn’t have a Labels track to shift.");
      return false;
    }

    const nextUp = clampInt(curUp + 1, lo, hi);
    const nextDown = clampInt(curDown - 1, lo, hi);

    const updates = {};
    if (nextUp !== curUp) updates[p(upKey)] = nextUp;
    if (nextDown !== curDown) updates[p(downKey)] = nextDown;

    if (!Object.keys(updates).length) {
      ui.notifications?.info?.("No Labels changed (already at limits).");
      return false;
    }

    try {
      await actor.update(updates);
      return true;
    } catch (err) {
      console.error(`[${NS}] Failed to shift labels for ${actor.name}`, err);
      ui.notifications?.error?.("Couldn’t shift labels (see console).");
      return false;
    }
  }

  /* -------------------------- Influence helpers (copied pattern) -------------------------- */

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
      id: (foundry.utils.randomID?.(16) ?? Math.random().toString(36).slice(2)),
      name: nameToMatch,
      hasInfluenceOver: false,   // "they → me"
      haveInfluenceOver: false,  // "me → them"
      locked: false
    };
    arr.push(obj);
    return { idx: arr.length - 1, obj };
  }

  function stateSymbol(e) {
    const out = !!e?.haveInfluenceOver; // me → them
    const inn = !!e?.hasInfluenceOver;  // them → me
    if (out && inn) return "⬌";
    if (out) return "⬆";
    if (inn) return "⬇";
    return "x";
  }

  async function writeInfluencesIfChanged(actor, beforeArr, afterArr) {
    // Cheap structural compare
    const sameLen = beforeArr.length === afterArr.length;
    let equal = sameLen;
    if (equal) {
      for (let i = 0; i < beforeArr.length; i++) {
        const a = beforeArr[i], b = afterArr[i];
        if (!a || !b) { equal = false; break; }
        if (normalize(a.name) !== normalize(b.name) ||
          !!a.hasInfluenceOver !== !!b.hasInfluenceOver ||
          !!a.haveInfluenceOver !== !!b.haveInfluenceOver ||
          !!a.locked !== !!b.locked) { equal = false; break; }
      }
    }
    if (equal) return false;

    await actor.setFlag(NS, "influences", afterArr);
    return true;
  }

  function mutateInfluenceSide(inflArr, counterpartyName, which) {
    // which: "gt"|"lt"|"eq"|"reset"
    const { idx, obj } = ensureInfluenceEntry(inflArr, counterpartyName);
    const prev = { has: !!obj.hasInfluenceOver, have: !!obj.haveInfluenceOver };

    if (obj.locked === true && which !== "reset") {
      return { changed: false, prev, now: prev, pruned: false };
    }

    if (which === "gt") {
      obj.haveInfluenceOver = true; // me → them
    } else if (which === "lt") {
      obj.hasInfluenceOver = true;  // them → me
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
    return { changed: prev.has !== now.has || prev.have !== now.have || pruned, prev, now, pruned };
  }

  async function announceInfluenceChange(srcName, tgtName, beforeSym, afterSym) {
    if (!game.settings.get(NS, KEY_ANNOUNCE_INFLUENCE)) return;

    const badge = (s) => {
      const css = "display:inline-block;padding:0 .35rem;border-radius:.25rem;font-weight:700;";
      if (s === "⬆") return `<span style="${css}background:#4CAF50;color:#fff">${s}</span>`;
      if (s === "⬇") return `<span style="${css}background:#9C27B0;color:#fff">${s}</span>`;
      if (s === "⬌") return `<span style="${css}background:#2196F3;color:#fff">${s}</span>`;
      return `<span style="${css}background:#F44336;color:#fff">${s}</span>`;
    };

    let title = "Influence Change";
    switch (afterSym) {
      case "⬆": title = `${srcName} gains Influence over ${tgtName}`; break;
      case "⬇": title = `${srcName} gives Influence to ${tgtName}`; break;
      case "⬌": title = `${srcName} and ${tgtName}<br/>share Influence`; break;
      default:  title = `${srcName} and ${tgtName}<br/>do not share Influence`; break;
    }

    let content = `<h6>${badge(afterSym)} ${title}</h6>`;
    if (beforeSym !== "x" && beforeSym !== afterSym) {
      content += `<b>Previous:</b> <em>${srcName}</em> ${badge(beforeSym)} <em>${tgtName}</em>`;
    }

    await ChatMessage.create({
      content,
      type: CONST.CHAT_MESSAGE_TYPES.OTHER
    });
  }

  function requestGMApplyInfluence(payload) {
    try { game.socket?.emit(SOCKET_NS, payload); }
    catch (_) { /* symmetry sync is a fallback */ }
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

    // Apply local mutations (mirror on B)
    let aPrevSym = "—", aNowSym = "—";

    {
      const stA = mutateInfluenceSide(
        aAfter,
        nameBforA,
        directive === "gt" ? "gt" : directive === "lt" ? "lt" : directive === "eq" ? "eq" : "reset"
      );
      aPrevSym = stateSymbol({ hasInfluenceOver: stA.prev.has, haveInfluenceOver: stA.prev.have });
      aNowSym = stateSymbol({ hasInfluenceOver: stA.now.has, haveInfluenceOver: stA.now.have });
    }

    {
      let whichB = "reset";
      if (directive === "gt") whichB = "lt";
      else if (directive === "lt") whichB = "gt";
      else if (directive === "eq") whichB = "eq";
      mutateInfluenceSide(bAfter, nameAforB, whichB);
    }

    const tasks = [];
    const gmPayload = { action: "applyPair", srcId: actorA.id, tgtId: actorB.id, directive };

    if (canEditActor(actorA)) tasks.push(writeInfluencesIfChanged(actorA, aBefore, aAfter));
    else if (useGMRelay) gmPayload.aAfter = aAfter;

    if (canEditActor(actorB)) tasks.push(writeInfluencesIfChanged(actorB, bBefore, bAfter));
    else if (useGMRelay) gmPayload.bAfter = bAfter;

    if (useGMRelay && (!canEditActor(actorA) || !canEditActor(actorB))) {
      requestGMApplyInfluence(gmPayload);
    }

    try { await Promise.all(tasks); }
    catch (err) {
      console.error(`[${NS}] Failed to set Influence`, err);
      ui.notifications?.error?.("Couldn’t update Influence (see console).");
      return;
    }

    // Ask helpers to sync (harmless)
    try { await InfluenceIndex?.syncCharacterPairFlags?.(actorA); } catch (_) { /* no-op */ }

    // Announce (prefer A line)
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

      if (game.user?.isGM) this.normalizeCooldowns().finally(() => this._queueRender());
      else this._queueRender();

      this._setupContextMenu();
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
          foundry.utils.getProperty(changes, `flags.${NS}.${FLAG_COOLDOWN_MAP}`) !== undefined;

        if (flagChanged) this._queueRender();
        if (doc?.active === true || isRelevant) this._queueRender();
        if (Object.prototype.hasOwnProperty.call(changes ?? {}, "active")) this._queueRender();
      });

      Hooks.on("createCombatant", (cbt) => {
        if (cbt?.combat?.id !== getActiveCombat()?.id) return;
        if (game.user?.isGM) this.normalizeCooldowns().finally(() => this._queueRender());
        else this._queueRender();
      });

      Hooks.on("deleteCombatant", (cbt) => {
        if (cbt?.combat?.id !== getActiveCombat()?.id) return;
        if (game.user?.isGM) this.normalizeCooldowns().finally(() => this._queueRender());
        else this._queueRender();
      });

      Hooks.on("updateCombatant", (doc, changes) => {
        if (doc?.combat?.id !== getActiveCombat()?.id) return;
        const defeatedChanged = Object.prototype.hasOwnProperty.call(changes ?? {}, "defeated");
        if (defeatedChanged) this._queueRender();
      });

      Hooks.on("updateActor", (_actor, changes) => {
        const xpChanged = foundry.utils.getProperty(changes, "system.attributes.xp.value") !== undefined;
        const imgChanged = changes?.img !== undefined;
        const nameChanged = changes?.name !== undefined;
        const hpChanged = foundry.utils.getProperty(changes, "system.attributes.hp.value") !== undefined;
        const fallbackPotChanged =
          foundry.utils.getProperty(changes, `flags.${NS}.${FLAG_POTENTIAL_FALLBACK}`) !== undefined;

        if (xpChanged || imgChanged || nameChanged || hpChanged || fallbackPotChanged) this._queueRender();
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
              reason: reason ?? "shift"
            });
          }
        });
      } catch (err) {
        console.warn(`[${NS}] Socket unavailable; some Turn Cards relays require GM permissions.`, err);
      }
    },

    _activateListeners() {
      if (!this.root) return;
      if (this.root.dataset.bound === "1") return;

      this.root.addEventListener("click", async (ev) => {
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
      }, { capture: true });

      // Right-click Potential star to subtract (without interfering with card context menu)
      this.root.addEventListener("contextmenu", async (ev) => {
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

        // Fallback UI if ContextMenu isn't available
        if (!this._contextMenu) {
          const cardEl = target.closest?.(".turncard[data-actor-id]");
          if (!cardEl) return;
          ev.preventDefault();
          ev.stopPropagation();
          ev.stopImmediatePropagation?.();
          await this._openContextDialogFallback(cardEl);
        }
      }, { capture: true });

      // Keyboard accessibility for card open (Enter/Space)
      this.root.addEventListener("keydown", (ev) => {
        const target = ev.target instanceof HTMLElement ? ev.target : null;
        if (!target) return;
        if (ev.key !== "Enter" && ev.key !== " ") return;

        const card = target.closest?.(".turncard[data-combatant-id]");
        if (!card) return;

        // Don’t trigger if focused element is a button
        if (target.closest?.("button")) return;

        ev.preventDefault();
        card.click();
      });

      this.root.dataset.bound = "1";
    },

    _setupContextMenu() {
      const $ = globalThis.$ ?? window.$;
      const CM = globalThis.ContextMenu ?? foundry?.applications?.api?.ContextMenu;
      if (!$ || typeof CM !== "function") return;

      try {
        // eslint-disable-next-line no-new
        this._contextMenu = new CM($(this.root), ".turncard[data-actor-id]", [
          {
            name: "Gain Influence over",
            icon: '<i class="fa-solid fa-up"></i>',
            callback: (li) => this._ctxInfluence(li, "gt")
          },
          {
            name: "Gain Synergy (mutual influence)",
            icon: '<i class="fa-solid fa-left-right"></i>',
            callback: (li) => this._ctxInfluence(li, "eq")
          },
          {
            name: "Give Influence to",
            icon: '<i class="fa-solid fa-down"></i>',
            callback: (li) => this._ctxInfluence(li, "lt")
          },
          {
            name: "Use Influence against…",
            icon: '<i class="fa-solid fa-bullseye"></i>',
            callback: (li) => this._ctxUseInfluence(li)
          }
        ]);
      } catch (err) {
        console.warn(`[${NS}] Failed to initialize ContextMenu for Turn Cards`, err);
        this._contextMenu = null;
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
        const tok = (canvas.tokens?.placeables ?? []).find(t => t?.actor?.id === myActor.id) || null;
        return { token: tok, actor: myActor };
      }

      const owned = (canvas.tokens?.placeables ?? []).find(t => t.actor && t.actor.isOwner);
      if (owned) return { token: owned, actor: owned.actor };

      ui.notifications?.warn?.("Select your character token or set your User Character first.");
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
        ui.notifications?.warn?.("Pick someone else’s card to set Influence with them.");
        return;
      }

      const tgtTok = (canvas.tokens?.placeables ?? []).find(t => t?.actor?.id === targetActor.id) || null;

      await applyInfluencePair({
        actorA: src.actor,
        tokA: src.token ?? null,
        actorB: targetActor,
        tokB: tgtTok,
        directive
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
        ui.notifications?.warn?.("You can’t use Influence against yourself.");
        return;
      }

      // Verify (fuzzy) that src has Influence over target
      const has = InfluenceIndex.hasEdgeFromKeyToKey(compositeKey(src.actor), compositeKey(targetActor));
      if (!has) {
        ui.notifications?.warn?.(`You don’t have Influence over ${targetActor.name}.`);
        return;
      }

      const picked = await promptShiftLabels(targetActor, { title: `Use Influence on: ${targetActor.name}` });
      if (!picked) return;

      if (canEditActor(targetActor)) {
        const ok = await applyShiftLabels(targetActor, picked.up, picked.down);
        if (ok) {
          await ChatMessage.create({
            content:
              `<b>${foundry.utils.escapeHTML(src.actor.name ?? "Someone")}</b> uses Influence to shift ` +
              `<b>${foundry.utils.escapeHTML(targetActor.name ?? "someone")}</b>: ` +
              `<span class="shift up">+${foundry.utils.escapeHTML(String(statLabel(targetActor, picked.up)))}</span>, ` +
              `<span class="shift down">-${foundry.utils.escapeHTML(String(statLabel(targetActor, picked.down)))}</span>.`,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER
          });
        }
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
          reason: "useInfluence"
        });
      }
    },

    async _openContextDialogFallback(cardEl) {
      const actorId = cardEl?.dataset?.actorId ?? null;
      const targetActor = actorId ? game.actors?.get?.(actorId) : null;
      if (!targetActor) return;

      const content = `
        <p style="margin:0 0 .5rem 0;"><b>${foundry.utils.escapeHTML(targetActor.name ?? "Character")}</b></p>
        <p class="notes" style="margin:0 0 .75rem 0; opacity:.8;">Choose an Influence action.</p>
      `;

      return new Promise((resolve) => {
        // eslint-disable-next-line no-new
        new Dialog({
          title: "Turn Card Actions",
          content,
          buttons: {
            gt: { label: "Gain Influence over", callback: async () => { await this._ctxInfluence(cardEl, "gt"); resolve(true); } },
            eq: { label: "Gain Synergy (mutual)", callback: async () => { await this._ctxInfluence(cardEl, "eq"); resolve(true); } },
            lt: { label: "Give Influence to", callback: async () => { await this._ctxInfluence(cardEl, "lt"); resolve(true); } },
            use: { label: "Use Influence against…", callback: async () => { await this._ctxUseInfluence(cardEl); resolve(true); } },
            cancel: { label: "Cancel", callback: () => resolve(false) }
          },
          default: "cancel",
          close: () => resolve(false)
        }).render(true);
      });
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
        ui.notifications?.warn?.("You don’t have permission to change that character’s Potential.");
        return;
      }

      const cur = actorPotentialValue(actor);
      const next = clampInt(cur + delta, 0, POTENTIAL_MAX);
      if (next === cur) return;

      await setActorPotential(actor, next);

      actionEl.classList.remove("is-bump");
      // eslint-disable-next-line no-unused-expressions
      actionEl.offsetHeight;
      actionEl.classList.add("is-bump");

      this._queueRender();
    },

    async _handleShiftLabelsClick(actionEl) {
      const actorId = actionEl.dataset.actorId ?? null;
      if (!actorId) return;

      const actor = game.actors?.get?.(actorId);
      if (!actor) return;

      if (!canEditActor(actor)) {
        ui.notifications?.warn?.("You don’t have permission to shift that character’s Labels.");
        return;
      }

      const picked = await promptShiftLabels(actor, { title: `Shift Labels: ${actor.name}` });
      if (!picked) return;

      const ok = await applyShiftLabels(actor, picked.up, picked.down);
      if (ok) this._queueRender();
    },

    async _handleTeamForwardClick(actionEl) {
      const actorId = actionEl.dataset.actorId ?? null;
      if (!actorId) return;

      const actor = game.actors?.get?.(actorId);
      if (!actor) return;

      const teamSvc = globalThis.MasksTeam;
      if (!teamSvc) {
        ui.notifications?.warn?.("Team pool is not available yet. A GM may need to open the world first.");
        return;
      }

      if (teamSvc.value <= 0) {
        ui.notifications?.warn?.("There’s no Team left to spend.");
        return;
      }

      const canDoLocal = teamSvc.canEdit === true && canEditActor(actor) === true;
      const canRelay = !!game.socket && hasAnyActiveGM();

      if (!canDoLocal) {
        if (!canRelay) {
          ui.notifications?.warn?.("You don’t have permission to Aid that character (and no GM is available to relay).");
          return;
        }
        this._requestGmTeamForward(actorId);
        return;
      }

      const forwardPath = "system.resources.forward.value";
      const currentForward = Number(foundry.utils.getProperty(actor, forwardPath)) || 0;
      const nextForward = Math.max(0, currentForward + 1);

      try {
        await teamSvc.change?.(-1, { announce: false });
        await actor.update({ [forwardPath]: nextForward });

        const safeName = foundry.utils.escapeHTML?.(actor.name ?? "Character") ?? (actor.name ?? "Character");
        const content = `${TEAM_SPEND_UUID} — ${safeName} gains <b>+1 Forward</b>.`;

        await ChatMessage.create({
          content,
          type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });
      } catch (err) {
        console.error(`[${NS}] Failed to spend Team / grant +1 Forward for ${actor.name}`, err);
        ui.notifications?.error?.("Couldn’t spend Team for that action (see console).");
        return;
      }

      actionEl.classList.remove("is-bump");
      // eslint-disable-next-line no-unused-expressions
      actionEl.offsetHeight;
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
      const currentForward = Number(foundry.utils.getProperty(actor, forwardPath)) || 0;
      const nextForward = Math.max(0, currentForward + 1);

      try {
        await teamSvc.change?.(-1, { announce: false });
        await actor.update({ [forwardPath]: nextForward });

        const safeName = foundry.utils.escapeHTML?.(actor.name ?? "Character") ?? (actor.name ?? "Character");
        const by = userId ? (game.users?.get?.(userId)?.name ?? null) : null;

        const content =
          `${TEAM_SPEND_UUID} — ${safeName} gains <b>+1 Forward</b>.` +
          (by ? ` <span class="color-muted">— requested by ${foundry.utils.escapeHTML(by)}</span>` : "");

        await ChatMessage.create({ content, type: CONST.CHAT_MESSAGE_TYPES.OTHER });
      } catch (err) {
        console.error(`[${NS}] GM failed to apply Aid for ${actor.name}`, err);
      } finally {
        this._queueRender();
      }
    },

    async _gmApplyShiftLabels({ targetActorId, sourceActorId = null, up, down, reason = "shift" }) {
      const target = game.actors?.get?.(targetActorId);
      if (!target) return;

      // If this is "Use Influence", validate again on the GM for safety.
      if (reason === "useInfluence" && sourceActorId) {
        const src = game.actors?.get?.(sourceActorId);
        const ok = !!src && InfluenceIndex.hasEdgeFromKeyToKey(compositeKey(src), compositeKey(target));
        if (!ok) return;
      }

      const okShift = await applyShiftLabels(target, up, down);
      if (!okShift) return;

      if (reason === "useInfluence") {
        const srcName = sourceActorId ? (game.actors?.get?.(sourceActorId)?.name ?? "Someone") : "Someone";
        await ChatMessage.create({
          content:
            `<b>${foundry.utils.escapeHTML(srcName)}</b> uses Influence to shift ` +
            `<b>${foundry.utils.escapeHTML(target.name ?? "someone")}</b>: ` +
            `<span class="shift up">+${foundry.utils.escapeHTML(String(statLabel(target, up)))}</span>, ` +
            `<span class="shift down">-${foundry.utils.escapeHTML(String(statLabel(target, down)))}</span>.`,
          type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });
      }

      this._queueRender();
    },

    _requestGmMarkActorTurn(actorId) {
      try {
        game.socket?.emit(SOCKET_NS, { action: "turnCardsMark", actorId });
      } catch (err) {
        console.warn(`[${NS}] Socket emit failed; Turn Cards mark requires GM permissions.`, err);
      }
    },

    _requestGmTeamForward(actorId) {
      try {
        game.socket?.emit(SOCKET_NS, { action: "turnCardsTeamForward", actorId, userId: game.user?.id ?? null });
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
          userId: game.user?.id ?? null
        });
      } catch (err) {
        console.warn(`[${NS}] Socket emit failed; Shift Labels relay requires GM.`, err);
      }
    },

    _queueRender() {
      if (this._renderQueued) return;
      this._renderQueued = true;
      setTimeout(async () => {
        try { await this.render(); }
        finally { this._renderQueued = false; }
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
     * GM-only: Clamp and migrate cooldown storage.
     * - Migrates legacy per-combatant flags into the combat map (if present).
     * - Drops map entries for removed combatants.
     * - Clamps values to current maxTurns.
     */
    async normalizeCooldowns() {
      const combat = getActiveCombat();
      if (!combat) return;
      if (!game.user?.isGM) return;

      const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);

      let map = this._readCooldownMap(combat);
      let changed = false;

      // If maxTurns <= 0, clear everything.
      if (maxTurns <= 0) {
        if (Object.keys(map).length) {
          map = {};
          changed = true;
        }
        // Also clear legacy flags
        for (const cbt of team) {
          try { await cbt.unsetFlag(NS, FLAG_REMAINING_OLD); } catch (_) { /* ignore */ }
        }
        if (changed) await this._writeCooldownMap(combat, map);
        return;
      }

      // Migrate legacy combatant flags → map (if map doesn't already have an entry)
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

        // Clear legacy regardless (keep things clean)
        try {
          const had = cbt.getFlag?.(NS, FLAG_REMAINING_OLD) !== undefined;
          if (had) await cbt.unsetFlag(NS, FLAG_REMAINING_OLD);
        } catch (_) { /* ignore */ }
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
     * Sets that combatant's remainingTurns = (teamSize - 1).
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
     * @param {string|null} excludeActorId - the actor who just acted (do not decrement them)
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

      const gm = game.user?.isGM === true;
      const cooldownMap = this._readCooldownMap(combat);

      const cards = team.map((cbt) => {
        const actor = cbt.actor;

        const ownsActor = canEditActor(actor);
        const downed = isDowned(cbt);

        const remaining = this._getRemainingFromMap(cooldownMap, cbt.id, maxTurns);
        const onCooldown = remaining > 0 && maxTurns > 0;

        const cooldownFrac = onCooldown && maxTurns > 0
          ? Math.max(0, Math.min(1, remaining / maxTurns))
          : 0;

        const potential = actorPotentialValue(actor);
        const potentialPct = POTENTIAL_MAX > 0
          ? `${Math.round((potential / POTENTIAL_MAX) * 100)}%`
          : "0%";

        const status = downed ? "down" : onCooldown ? "busy" : "ready";
        const statusLabel = downed ? "Downed" : onCooldown ? "Busy" : "Ready";

        // Action vs Aid overlay logic
        const canMarkTurn = canEditCombatant(cbt);
        const readyToAct = !downed && !onCooldown;

        // Aid availability (+1 Forward, -1 Team), local or via GM relay
        const canSpendTeam = !!teamSvc && teamValue > 0;
        const canForwardLocal = canSpendTeam && (teamSvc?.canEdit === true) && canEditActor(actor) === true;
        const canForwardRelay = canSpendTeam && !canForwardLocal && !!game.socket && hasAnyActiveGM();
        const canTeamForward = canForwardLocal || canForwardRelay;

        let aidUnavailableWhy = null;
        if (!teamSvc) aidUnavailableWhy = "Team pool unavailable";
        else if (teamValue <= 0) aidUnavailableWhy = "No Team left";
        else if (!game.socket) aidUnavailableWhy = "Socket unavailable";
        else if (!hasAnyActiveGM()) aidUnavailableWhy = "No active GM to relay";
        else aidUnavailableWhy = "Unavailable";

        const actionLabel = canMarkTurn ? "Action" : "Aid";
        const actionAction = canMarkTurn ? "card-action" : "card-aid";

        const actionDisabled = downed
          ? true
          : (canMarkTurn ? !readyToAct : !canTeamForward);

        const actionAria = canMarkTurn
          ? (readyToAct ? `Mark action taken for ${actor.name}` : `${actor.name} is not ready to act`)
          : (canTeamForward
            ? `Spend 1 Team to Aid ${actor.name} (+1 Forward)`
            : `Aid unavailable (${aidUnavailableWhy})`);

        const ariaLabelParts = [
          actor?.name ? `Character: ${actor.name}` : "Character",
          downed ? "Downed" : null,
          onCooldown ? `Busy (${remaining} turn(s) remaining)` : "Ready to act",
          `Potential ${potential} of ${POTENTIAL_MAX}`
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

          // Overlay action (Action or Aid)
          actionAction,
          actionLabel,
          actionDisabled,
          actionAria,

          // Quick spend Team → +1 Forward
          canTeamForward,

          // Shift Labels (circle)
          canShiftLabels: ownsActor
        };
      });

      const context = {
        gm,
        showTeamCard,
        teamSize,
        maxTurns,
        team: teamValue,
        teamCanEdit: teamUiCanEdit,
        cards
      };

      const html = await renderTemplate(`modules/${NS}/templates/turncards.hbs`, context);
      this.root.innerHTML = html;
    }
  };

  Hooks.once("ready", () => {
    try { TurnCardsHUD.mount(); }
    catch (err) { console.error(`[${NS}] Failed to mount turn cards HUD`, err); }
  });
})();
