/* global Hooks, game, ui, foundry */

/**
 * masks-newgeneration-unofficial / turn-cards.mjs
 * ----------------------------------------------------------------------------
 * Team Turn Cards HUD:
 * - Shows playable Characters (actor.type === "character") in the active Combat.
 * - Cooldown = "can't act again until all other PCs have acted":
 *   remainingTurns = (teamSize - 1) after acting.
 *   Each subsequent turn by another PC or the GM card decrements remainingTurns by 1.
 * - Stores cooldown on Combatant flags so it persists across reloads.
 * - Potential uses actor.system.attributes.xp.value (0–5) when present; otherwise actor flag fallback.
 */

(() => {
	const NS = "masks-newgeneration-unofficial";

	// Combatant flag for cooldown remaining turns
	const FLAG_REMAINING = "turnCardsRemainingTurns";

	// Actor fallback flag for potential if the sheet doesn't have system.attributes.xp
	const FLAG_POTENTIAL_FALLBACK = "turnCardsPotential";

	const POTENTIAL_MAX = 5;

	const clampInt = (n, lo, hi) => {
		const x = Number(n);
		if (!Number.isFinite(x)) return lo;
		return Math.min(hi, Math.max(lo, Math.floor(x)));
	};

	const escape = (s) =>
		foundry?.utils?.escapeHTML
			? foundry.utils.escapeHTML(String(s ?? ""))
			: String(s ?? "");

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

	function actorPotentialValue(actor) {
		// Prefer the system XP track if it exists (Masks labels this “Potential” already)
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
				"You don’t have permission to change that character’s Potential."
			);
		}
	}

	function isDowned(cbt) {
		// Prefer explicit defeated flags (set by module/health.mjs) or HP <= 0
		const defeated = cbt?.defeated === true;
		const hp = Number(
			foundry?.utils?.getProperty?.(cbt?.actor, "system.attributes.hp.value")
		);
		const hpZero = Number.isFinite(hp) && hp <= 0;
		return defeated || hpZero;
	}

	const TurnCardsHUD = {
		root: null,
		_hooksRegistered: false,
		_renderQueued: false,

		mount() {
			// Ensure host exists per requirement: #ui-middle #ui-bottom
			const host =
				document.querySelector("#ui-middle #ui-bottom") ||
				document.querySelector("#ui-bottom") ||
				document.querySelector("#ui-middle") ||
				document.body;

			// Tear down old
			this.root?.remove();

			// Create root
			this.root = document.createElement("section");
			this.root.id = "masks-turncards";
			this.root.setAttribute("role", "group");
			this.root.setAttribute("aria-label", "Team Turn Cards");

			host.appendChild(this.root);

			this._activateListeners();
			this._registerHooks();
			this._queueRender();
		},

		_registerHooks() {
			if (this._hooksRegistered) return;
			this._hooksRegistered = true;

			// Re-render on combat lifecycle
			Hooks.on("createCombat", () => this._queueRender());
			Hooks.on("deleteCombat", () => this._queueRender());
			Hooks.on("updateCombat", (doc, changes) => {
				// Relevant changes: active, combatant order, round/turn changes, etc.
				if (!doc) return;
				if (doc.active === true || doc.id === getActiveCombat()?.id)
					this._queueRender();
				if (Object.prototype.hasOwnProperty.call(changes ?? {}, "active"))
					this._queueRender();
			});

			// Combatants / flags / defeated state
			Hooks.on("createCombatant", (cbt) => {
				if (cbt?.combat?.id === getActiveCombat()?.id) {
					this.normalizeCooldowns().finally(() => this._queueRender());
				}
			});
			Hooks.on("deleteCombatant", (cbt) => {
				if (cbt?.combat?.id === getActiveCombat()?.id) {
					this.normalizeCooldowns().finally(() => this._queueRender());
				}
			});
			Hooks.on("updateCombatant", (doc, changes) => {
				if (doc?.combat?.id !== getActiveCombat()?.id) return;
				const flagChanged =
					foundry.utils.getProperty(changes, `flags.${NS}.${FLAG_REMAINING}`) !==
					undefined;
				const defeatedChanged = Object.prototype.hasOwnProperty.call(
					changes ?? {},
					"defeated"
				);
				if (flagChanged || defeatedChanged) this._queueRender();
			});

			// Potential (XP) updates / actor portrait updates
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
				if (
					xpChanged ||
					imgChanged ||
					nameChanged ||
					hpChanged ||
					fallbackPotChanged
				)
					this._queueRender();
			});

			// Scene swaps can reflow UI
			Hooks.on("canvasReady", () => {
				// If our element was removed for any reason, re-mount
				if (!document.getElementById("masks-turncards")) this.mount();
				else this._queueRender();
			});
		},

		_activateListeners() {
			if (!this.root) return;
			if (this.root.dataset.bound === "1") return;

			// Delegated clicks
			this.root.addEventListener(
				"click",
				async (ev) => {
					const target = ev.target instanceof HTMLElement ? ev.target : null;
					if (!target) return;

					// Action buttons (placeholders, gm buttons, potential)
					const actionEl = target.closest?.("[data-action]");
					if (actionEl) {
						const action = actionEl.dataset.action;
						const wrap = actionEl.closest?.("[data-combatant-id]");
						const combatantId = wrap?.dataset?.combatantId ?? null;

						// Never let buttons trigger sheet open
						ev.preventDefault();
						ev.stopPropagation();
						ev.stopImmediatePropagation?.();

						if (action === "potential") {
							if (!combatantId) return;
							const combat = getActiveCombat();
							const cbt = combat?.combatants?.get?.(combatantId);
							const actor = cbt?.actor;
							if (!actor) return;

							if (!canEditActor(actor)) {
								ui.notifications?.warn?.(
									"You don’t have permission to change that character’s Potential."
								);
								return;
							}

							const cur = actorPotentialValue(actor);
							const next = clampInt(cur + 1, 0, POTENTIAL_MAX);
							await setActorPotential(actor, next);

							// Tiny feedback (CSS animation hook)
							actionEl.classList.remove("is-bump");
							// eslint-disable-next-line no-unused-expressions
							actionEl.offsetHeight;
							actionEl.classList.add("is-bump");

							this._queueRender();
							return;
						}

						if (action === "gm-turn") {
							if (!game.user?.isGM) return;
							await this.advanceCooldowns(null);
							return;
						}

						if (action === "gm-mark-turn") {
							if (!game.user?.isGM) return;
							const actorId = actionEl.dataset.actorId ?? null;
							if (!actorId) return;
							await this.onActorTurn(actorId);
							await this.advanceCooldowns(actorId);
							return;
						}

						// Placeholder actions: do nothing for now
						return;
					}

					// Click anywhere else on a card to open sheet
					const card = target.closest?.(".turncard[data-combatant-id]");
					if (!card) return;

					const combatantId = card.dataset.combatantId;
					const combat = getActiveCombat();
					const cbt = combat?.combatants?.get?.(combatantId);
					const actor = cbt?.actor;
					if (!actor) return;

					// Don’t open sheet if downed overlay exists and user clicked it? Requirement says clicking elsewhere opens.
					// We'll still open the sheet regardless of downed state.
					actor.sheet?.render?.(true);
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

				// Don’t trigger if focused element is a button
				if (target.closest?.("button")) return;

				ev.preventDefault();
				card.click();
			});

			this.root.dataset.bound = "1";
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

		_getRemaining(cbt, maxTurns) {
			const raw = Number(cbt?.getFlag?.(NS, FLAG_REMAINING));
			const n = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
			return Math.min(n, Math.max(0, maxTurns));
		},

		async _setRemaining(cbt, n) {
			if (!cbt) return;
			const v = Math.max(0, Math.floor(Number(n) || 0));
			try {
				if (v <= 0) await cbt.unsetFlag(NS, FLAG_REMAINING);
				else await cbt.setFlag(NS, FLAG_REMAINING, v);
			} catch (err) {
				// Permission-safe: if a player can't edit the combatant, fail quietly
				console.warn(`[${NS}] Failed to set remaining turns for ${cbt?.name}`, err);
			}
		},

		async normalizeCooldowns() {
			const combat = getActiveCombat();
			if (!combat) return;

			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);
			const updates = [];

			for (const cbt of team) {
				if (!canEditCombatant(cbt)) continue;

				const raw = Number(cbt.getFlag(NS, FLAG_REMAINING));
				const n = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
				const clamped = Math.min(n, maxTurns);
				if (clamped !== n) updates.push(this._setRemaining(cbt, clamped));
			}

			if (updates.length) await Promise.allSettled(updates);
		},

		/**
		 * Called when a character takes a turn.
		 * Sets that actor’s remainingTurns = (teamSize - 1).
		 */
		async onActorTurn(actorId) {
			const combat = getActiveCombat();
			if (!combat) return;

			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);
			if (maxTurns <= 0) {
				// Solo team: ensure nothing is stuck on cooldown
				await this.normalizeCooldowns();
				this._queueRender();
				return;
			}

			const acting = team.find((cbt) => cbt?.actor?.id === actorId);
			if (!acting) return;

			if (!canEditCombatant(acting)) {
				ui.notifications?.warn?.(
					"You don’t have permission to mark that combatant’s turn."
				);
				return;
			}

			await this._setRemaining(acting, maxTurns);
			this._queueRender();
		},

		/**
		 * Called whenever any character (or GM) ends a turn.
		 * Decrements remainingTurns for every other actor currently > 0.
		 * @param {string|null} excludeActorId - the actor who just acted (do not decrement them)
		 */
		async advanceCooldowns(excludeActorId = null) {
			const combat = getActiveCombat();
			if (!combat) return;

			const { team, maxTurns } = this._teamSizeAndMaxTurns(combat);
			if (maxTurns <= 0) {
				await this.normalizeCooldowns();
				this._queueRender();
				return;
			}

			const updates = [];
			for (const cbt of team) {
				const a = cbt?.actor;
				if (!a) continue;

				// Skip the actor whose turn just ended (if provided)
				if (excludeActorId && a.id === excludeActorId) continue;

				const cur = this._getRemaining(cbt, maxTurns);
				if (cur <= 0) continue;

				if (!canEditCombatant(cbt)) continue;

				updates.push(this._setRemaining(cbt, cur - 1));
			}

			if (updates.length) await Promise.allSettled(updates);
			this._queueRender();
		},

		async render() {
			if (!this.root) return;

			const combat = getActiveCombat();
			const gm = game.user?.isGM === true;

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

			const cards = [];

			// GM-only extra card
			if (gm) {
				cards.push(`
          <div class="turncard-wrapper turncard-wrapper--gm">
            <div class="turncard turncard--gm" role="group" aria-label="GM turn card">
              <div class="turncard__inner">
                <div class="turncard__portrait turncard__portrait--gm">
                  <div class="turncard__gm-mark">Team</div>
                </div>

                <div class="turncard__nameplate">
                  <div class="turncard__name" title="GM">
                    Team
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              class="turncard__gm-btn turncard__gm-btn--gmturn"
              data-action="gm-turn"
              aria-label="Advance cooldowns (GM turn)"
            >
              GM Turn
            </button>
          </div>
        `);
			}

			for (const cbt of team) {
				const actor = cbt.actor;
				const owns = canEditActor(actor);
				const downed = isDowned(cbt);

				const remaining = this._getRemaining(cbt, maxTurns);
				const onCooldown = remaining > 0 && maxTurns > 0;

				const cooldownFrac =
					onCooldown && maxTurns > 0
						? Math.max(0, Math.min(1, remaining / maxTurns))
						: 0;

				const potential = actorPotentialValue(actor);
				const potentialPct = `${Math.round((potential / POTENTIAL_MAX) * 100)}%`;

				const downedId = `turncard-downed-${cbt.id}`;

				const leftBtn = owns
					? `<button type="button" class="turncard__mini-btn" data-action="placeholder-star" aria-label="Placeholder (owned)">*</button>`
					: `<span class="turncard__mini-spacer" aria-hidden="true"></span>`;

				const plusBtn = `<button type="button" class="turncard__mini-btn" data-action="placeholder-plus" aria-label="Placeholder: plus">+</button>`;
				const plusPlusBtn = owns
					? `<button type="button" class="turncard__mini-btn" data-action="placeholder-plusplus" aria-label="Placeholder (owned): plus plus">++</button>`
					: "";

				const cooldownBar =
					maxTurns > 0
						? `
            <div class="turncard__cooldown ${
													onCooldown ? "" : "is-empty"
												}" aria-hidden="true">
              <div class="turncard__cooldown-fill" style="--masks-turncards-cooldown-frac:${cooldownFrac};"></div>
            </div>
          `
						: "";

				const downedOverlay = downed
					? `
            <div class="turncard__downed" id="${downedId}" role="status" aria-label="Downed">
              <div class="turncard__downed-label">DOWNED</div>
            </div>
          `
					: "";

				const ariaLabelParts = [
					actor?.name ? `Character: ${actor.name}` : "Character",
					downed ? "Downed" : null,
					onCooldown ? `On cooldown (${remaining} remaining)` : "Ready",
					`Potential ${potential} of ${POTENTIAL_MAX}`,
				].filter(Boolean);

				const cardHtml = `
          <div class="turncard-wrapper" data-combatant-id="${escape(cbt.id)}">
            <div
              class="turncard ${onCooldown ? "is-cooldown" : ""} ${
					downed ? "is-downed" : ""
				}"
              data-combatant-id="${escape(cbt.id)}"
              data-actor-id="${escape(actor.id)}"
              role="button"
              tabindex="0"
              aria-label="${escape(ariaLabelParts.join(". "))}"
              ${downed ? `aria-describedby="${downedId}"` : ""}
            >
              <div class="turncard__inner">

                ${cooldownBar}
                <div class="turncard__portrait">

                  <img src="${escape(actor.img ?? "")}" alt="${escape(
					actor.name ?? "Character portrait"
				)}" loading="lazy" />
                </div>

                <div class="turncard__nameplate">
                  <div class="turncard__name" title="${escape(
																			actor.name ?? ""
																		)}">
                    ${escape(actor.name ?? "UNKNOWN")}
                  </div>

                </div>

                <button
                  type="button"
                  class="turncard__pentagon"
                  data-action="placeholder-pentagon"
                  aria-label="Future feature placeholder"
                >
                  <i class="fa-thin fa-circle"></i>
                </button>

                <button
                  type="button"
                  class="turncard__potential"
                  data-action="potential"
                  aria-label="Increase potential (currently ${potential} of ${POTENTIAL_MAX})"
                  style="--masks-turncards-potential-fill:${potentialPct};"
                >
                  <i class="fa-solid fa-star"></i>
                </button>
              </div>

              ${downedOverlay}
            </div>

            ${
													gm
														? `
              <button
                type="button"
                class="turncard__gm-btn"
                data-action="gm-mark-turn"
                data-actor-id="${escape(actor.id)}"
                aria-label="Mark turn taken for ${escape(
																	actor.name ?? "character"
																)}"
              >
                Mark Turn Taken
              </button>
            `
														: ""
												}
          </div>
        `;

				cards.push(cardHtml);
			}

			this.root.innerHTML = `
        <div class="turncards-row" data-team-size="${teamSize}" data-max-turns="${maxTurns}">
          ${cards.join("\n")}
        </div>
      `;
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
