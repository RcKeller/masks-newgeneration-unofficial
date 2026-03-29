/* global game, foundry */
import { createLabelsGraphData, saveGraphAnimationState, animateGraphFromSavedState } from "../labels-graph";
import { NS, LABEL_BOUNDS, getLabelKeysForActor, getLabelPath, getLabelValue, CONDITION_TO_LABEL } from "../constants";

/**
 * Min/max bounds for numeric values (Forward/Ongoing only - labels use LABEL_BOUNDS from constants)
 */
const MODIFIER_BOUNDS = Object.freeze({
	forward: { min: -1, max: 8 },
	ongoing: { min: -1, max: 8 },
});

export function MasksActorSheetMixin(Base) {
	return class MasksActorSheet extends Base {
		/** @override */
		get template() {
			return 'modules/masks-newgeneration-unofficial/templates/sheets/actor-sheet.hbs';
		}

		/** @override */
		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				width: 900,
				height: 700,
				classes: ["pbta", "sheet", "actor"],
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
			});
		}

		/**
		 * Track scroll position for restoration
		 * @type {number}
		 */
		_scrollTop = 0;

		/**
		 * Cached label bar percentages for animation
		 * @type {Map<string, {solidPercent: string, ghostWidth: string, ghostLeft: string, ghostClass: string}>}
		 */
		_labelBarCache: Map<string, {solidPercent: string, ghostWidth: string, ghostLeft: string, ghostClass: string}> = new Map();

		/**
		 * Cached labels graph data (regenerated only when values change)
		 * @type {ReturnType<typeof createLabelsGraphData> | null}
		 */
		_cachedLabelsGraph: ReturnType<typeof createLabelsGraphData> | null = null;

		/**
		 * Cache key for labels graph invalidation
		 * @type {string | null}
		 */
		_labelsGraphCacheKey: string | null = null;

		/**
		 * Generate a cache key for the labels graph based on values that affect rendering
		 * @returns {string} Cache key string
		 */
		_getLabelsGraphCacheKey(): string {
			const stats = this.actor.system.stats ?? {};
			const conditions = this.actor.system.attributes?.conditions?.options ?? {};
			return [
				stats.danger?.value ?? 0,
				stats.freak?.value ?? 0,
				stats.savior?.value ?? 0,
				stats.superior?.value ?? 0,
				stats.mundane?.value ?? 0,
				this.actor.system.resources?.forward?.value ?? 0,
				this.actor.system.resources?.ongoing?.value ?? 0,
				conditions[0]?.value ? 1 : 0,
				conditions[1]?.value ? 1 : 0,
				conditions[2]?.value ? 1 : 0,
				conditions[3]?.value ? 1 : 0,
				conditions[4]?.value ? 1 : 0,
			].join("|");
		}

		/**
		 * @override
		 * Skip expensive TextEditor.enrichHTML during getData.
		 * PbtA's base _prepareItems enriches ALL move descriptions sequentially,
		 * causing O(n*m) async lookups for @UUID links. This override skips enrichment
		 * and marks items for lazy enrichment when power cards are expanded.
		 */
		async _prepareItems(context: Record<string, any>) {
			// Only apply optimization for character sheets
			if (this.actor?.type !== "character") {
				return super._prepareItems(context);
			}

			const moveType = "move";
			const sheetConfig = game.pbta?.sheetConfig;
			const sheetType = this.actor.sheetType ?? this.actor.type;
			const moveTypes = sheetConfig?.actorTypes?.[sheetType]?.moveTypes;
			const equipmentTypes = sheetConfig?.actorTypes?.[sheetType]?.equipmentTypes;

			context.moveTypes = {};
			context.moves = {};

			if (moveTypes) {
				for (const [k, v] of Object.entries(moveTypes)) {
					context.moveTypes[k] = (v as { label: string }).label;
					context.moves[k] = [];
				}
			}

			context.equipmentTypes = {};
			context.equipment = {};

			if (equipmentTypes) {
				for (const [k, v] of Object.entries(equipmentTypes)) {
					context.equipmentTypes[k] = (v as { label: string }).label;
					context.equipment[k] = [];
				}
			}

			if (!context.equipment.PBTA_OTHER) context.equipment.PBTA_OTHER = [];
			if (!context.moves.PBTA_OTHER) context.moves.PBTA_OTHER = [];

			// Iterate through items and enrich descriptions (matching PbtA base pattern)
			for (const item of context.items) {
				item.img = item.img || foundry.documents.BaseItem.DEFAULT_ICON;

				// Get the source item document for proper enrichment context
				const sourceItem = this.actor.items.get(item._id) ?? {};
				const enrichmentOptions = {
					secrets: this.actor.isOwner,
					rollData: (sourceItem)?.getRollData?.() ?? {},
					relativeTo: sourceItem,
				};

				// Enrich all item descriptions so @UUID links render as clickable
				if (item.system?.description) {
					item.system.description = await (foundry.applications.ux as any).TextEditor.implementation.enrichHTML(
						item.system.description,
						enrichmentOptions
					);
				}
				// Also enrich choices and moveResults like PbtA base does
				if (item.system?.choices) {
					item.system.choices = await (foundry.applications.ux as any).TextEditor.implementation.enrichHTML(
						item.system.choices,
						enrichmentOptions
					);
				}
				if (item.system?.moveResults) {
					for (const [mK, mV] of Object.entries(item.system.moveResults)) {
						if ((mV as any).value) {
							item.system.moveResults[mK].value = await (foundry.applications.ux as any).TextEditor.implementation.enrichHTML(
								(mV as any).value,
								enrichmentOptions
							);
						}
					}
				}
				// Track expanded state for accordion behavior
				item.isExpanded = (this as any)._expanded?.has(item._id) ?? false;

				if (item.type === moveType) {
					const bucket = context.moves[item.system.moveType] ?? context.moves.PBTA_OTHER;
					bucket.push(item);
				} else if (item.type === "equipment") {
					const bucket = context.equipment[item.system.equipmentType] ?? context.equipment.PBTA_OTHER;
					bucket.push(item);
				}
			}
		}

		/**
		 * Label-specific icons for the Masks RPG stats
		 */
		static labelIcons = {
			danger: "fa-solid fa-fire",
			freak: "fa-solid fa-ghost",
			savior: "fa-solid fa-shield",
			superior: "fa-solid fa-hat-wizard",
			mundane: "fa-solid fa-user",
			soldier: "fa-solid fa-crosshairs",
		};

		/**
		 * Core Masks labels in display order
		 */
		static coreLabels = ["danger", "freak", "savior", "superior", "mundane"];

		/** @override */
		async getData() {
			const context = await super.getData();

			// Only add custom data for character sheets
			if (this.actor?.type === "character") {
				// Prepare filtered labels (only core Masks stats + Soldier if applicable)
				context.labels = this._prepareLabels();

				// Add label icons for template (used by labels graph)
				context.labelIcons = (this.constructor as typeof MasksActorSheet).labelIcons;
				// Labels graph data (cached - only regenerate when values change)
				const graphCacheKey = this._getLabelsGraphCacheKey();
				if (this._labelsGraphCacheKey !== graphCacheKey || !this._cachedLabelsGraph) {
					this._cachedLabelsGraph = createLabelsGraphData(this.actor, {
						size: 200,
						borderWidth: 2,
						showInnerLines: true,
						showIcons: true,
					});
					this._labelsGraphCacheKey = graphCacheKey;
				}
				context.labelsGraph = this._cachedLabelsGraph;

				// Prepare potential (XP) steps as boolean array for radio button rendering
				const xpValue = Number(this.actor.system.attributes?.xp?.value) || 0;
				const xpMax = Number(this.actor.system.attributes?.xp?.max) || 5;
				context.potentialSteps = [];
				for (let i = 0; i < xpMax; i++) {
					context.potentialSteps.push(i < xpValue);
				}

				// Prepare condition rows with icons and color coding
				context.conditionRows = this._prepareConditionRows();

				// Prepare playbook-specific attributes split between sidebar and playbook tab
				// Sidebar: Clock and Number types (e.g., Doom Track, Soldier's Fight)
				// Playbook tab: LongText and ListMany types (e.g., Sanctuary description)
				const { sidebarAttrs, tabAttrs } = this._prepareSplitPlaybookAttributes();
				context.playbookSidebarAttrs = sidebarAttrs;
				context.playbookAttributes = tabAttrs;

				// Forward/Ongoing active states (active when value is not 0)
				const forwardValue = Number(this.actor.system.resources?.forward?.value) || 0;
				const ongoingValue = Number(this.actor.system.resources?.ongoing?.value) || 0;
				context.forwardActive = forwardValue !== 0;
				context.ongoingActive = ongoingValue !== 0;
				context.forwardBounds = MODIFIER_BOUNDS.forward;
				context.ongoingBounds = MODIFIER_BOUNDS.ongoing;
			}

			// Prepare NPC condition rows in correct order: Afraid, Hopeless, Insecure, Guilty, Angry
			if (this.actor?.type === "npc") {
				context.npcConditionRows = this._prepareNpcConditionRows();
			}

			return context;
		}

		/**
		 * Prepare filtered stats list showing only core Masks labels (+ Soldier for that playbook)
		 * @returns {Array} Array of stat objects with computed properties for bar visualization
		 */
		_prepareLabels() {
			const stats = this.actor.system.stats ?? {};
			const labelIcons = (this.constructor as typeof MasksActorSheet).labelIcons;
			const labelKeys = getLabelKeysForActor(this.actor);

			// Get global bonus from Forward + Ongoing
			const forward = Number(this.actor.system.resources?.forward?.value) || 0;
			const ongoing = Number(this.actor.system.resources?.ongoing?.value) || 0;
			const globalBonus = forward + ongoing;

			// Determine which labels are affected by conditions
			const conditions = this.actor.system.attributes?.conditions?.options ?? {};
			const affectedLabels = new Set<string>();
			for (const [idx, opt] of Object.entries(conditions)) {
				if ((opt as any)?.value === true) {
					const label = CONDITION_TO_LABEL[idx as keyof typeof CONDITION_TO_LABEL];
					if (label) affectedLabels.add(label);
				}
			}

			// Helper to convert value to percentage
			const valueToPercent = (v: number) => Math.max(0, Math.min(100,
				((v - LABEL_BOUNDS.ROLL_MIN) / (LABEL_BOUNDS.ROLL_MAX - LABEL_BOUNDS.ROLL_MIN)) * 100
			));

			const labels = [];

			for (const key of labelKeys) {
				// Get base value from actor data
				const baseValue = getLabelValue(this.actor, key);

				// Calculate penalty and effective value
				const hasCondition = affectedLabels.has(key);
				const penalty = hasCondition ? 2 : 0;
				const effectiveValue = Math.max(LABEL_BOUNDS.ROLL_MIN, Math.min(LABEL_BOUNDS.ROLL_MAX,
					baseValue - penalty + globalBonus
				));

				// Get locked status (Soldier label doesn't have a lock)
				const locked = key === "soldier" ? false : !!(stats[key]?.locked);

				// Get display label
				let displayLabel: string;
				if (key === "soldier") {
					const soldierAttr = this.actor.system.attributes?.theSoldier;
					displayLabel = soldierAttr?.label ?? "Soldier";
				} else {
					displayLabel = stats[key]?.label ?? key.charAt(0).toUpperCase() + key.slice(1);
				}

				// Calculate bar percentages
				const basePercent = valueToPercent(baseValue);
				const effectivePercent = valueToPercent(effectiveValue);

				// Determine if there's a net bonus or penalty affecting the display
				const netModifier = globalBonus - penalty;
				const hasBonus = netModifier > 0;
				const hasPenalty = netModifier < 0;

				// Calculate bar values for visualization:
				// - Solid bar: ALWAYS shows the base stat value (what the character "owns")
				// - Ghost bar: shows the modifier effect
				//   - Bonus: extends beyond solid bar (starts at base, goes to effective)
				//   - Penalty: overlays end of solid bar (starts at effective, goes to base)
				const solidPercent = basePercent;
				const ghostWidth = Math.abs(effectivePercent - basePercent);
				const ghostLeft = Math.min(basePercent, effectivePercent);

				labels.push({
					key,
					label: displayLabel,
					value: baseValue,
					effectiveValue,
					locked,
					icon: labelIcons[key] ?? "fa-solid fa-tag",
					path: getLabelPath(key),
					min: LABEL_BOUNDS.ROLL_MIN,
					max: LABEL_BOUNDS.ROLL_MAX,
					atMin: baseValue <= LABEL_BOUNDS.ROLL_MIN,
					atMax: baseValue >= LABEL_BOUNDS.ROLL_MAX,
					canShiftUp: !locked && baseValue < LABEL_BOUNDS.SHIFT_MAX,
					canShiftDown: !locked && baseValue > LABEL_BOUNDS.SHIFT_MIN,
					// Bar visualization (base values for reference)
					barPercent: basePercent,
					effectivePercent,
					// Computed values for smooth animation
					solidPercent,
					ghostWidth,
					ghostLeft,
					hasBonus,
					hasPenalty,
					netModifier,
				});
			}

			return labels;
		}

		/**
		 * Prepare condition rows with icons and proper keys for color coding
		 * @returns {Array} Array of condition objects with key, label, icon, value, idx
		 */
		_prepareConditionRows() {
			const conditions = this.actor.system.attributes?.conditions?.options ?? {};
			// Map data indices to condition config
			const conditionConfig = {
				0: { key: "afraid", icon: "fa-solid fa-ghost", label: "Afraid" },
				1: { key: "angry", icon: "fa-solid fa-face-angry", label: "Angry" },
				2: { key: "guilty", icon: "fa-solid fa-scale-unbalanced", label: "Guilty" },
				3: { key: "hopeless", icon: "fa-solid fa-heart-crack", label: "Hopeless" },
				4: { key: "insecure", icon: "fa-solid fa-face-frown-open", label: "Insecure" },
			};
			// Display order: Afraid, Hopeless, Insecure, Guilty, Angry
			const displayOrder = [0, 3, 4, 2, 1];

			const rows = [];
			for (const idx of displayOrder) {
				const config = conditionConfig[idx];
				const cond = conditions[idx];
				if (!cond) continue;
				rows.push({
					idx: idx,
					key: config.key,
					icon: config.icon,
					label: cond.label || config.label,
					value: !!cond.value,
				});
			}
			return rows;
		}

		/**
		 * Prepare NPC condition rows in correct display order
		 * @returns {Array} Array of condition objects with idx, label, value
		 */
		_prepareNpcConditionRows() {
			const conditions = this.actor.system.attributes?.conditions?.options ?? {};
			// Display order: Afraid, Hopeless, Insecure, Guilty, Angry (indices 0, 3, 4, 2, 1)
			const displayOrder = [0, 3, 4, 2, 1];

			const rows = [];
			for (const idx of displayOrder) {
				const cond = conditions[idx];
				if (!cond) continue;
				rows.push({
					idx: idx,
					label: cond.label,
					value: !!cond.value,
				});
			}
			return rows;
		}

		/**
		 * Prepare playbook-specific attributes split between sidebar and playbook tab
		 * Sidebar: Clock and Number types (e.g., Doom Track, Soldier's Fight)
		 * Playbook tab: LongText and ListMany types (e.g., Sanctuary description, Doomed's Doom choices)
		 * @returns {Object} Object with sidebarAttrs and tabAttrs (each can be null if empty)
		 */
		_prepareSplitPlaybookAttributes() {
			const attrs = this.actor.system.attributes ?? {};
			const playbook = this.actor.system.playbook?.name ?? "";
			const configAttrs = game.pbta.sheetConfig?.actorTypes?.character?.attributes ?? {};
			const sidebarAttrs = {};
			const tabAttrs = {};
			let hasSidebar = false;
			let hasTab = false;

			for (const [key, attr] of Object.entries(attrs)) {
				// Get config defaults for this attribute (actor may not have all properties)
				const configAttr = configAttrs[key] ?? {};

				// Merge config with actor data (actor data takes precedence)
				const mergedPlaybook = attr.playbook ?? configAttr.playbook;
				const mergedType = attr.type ?? configAttr.type;
				const mergedCondition = attr.condition ?? configAttr.condition;

				// Skip non-playbook attributes (must have a specific playbook name, not just true)
				if (!mergedPlaybook || mergedPlaybook === true) continue;
				// Skip if playbook doesn't match
				if (mergedPlaybook !== playbook) continue;
				// Skip conditions (they're handled separately in the header)
				if (mergedCondition) continue;
				// Skip theSoldier - it's rendered as a 6th label in the labels section
				if (key === "theSoldier") continue;
				// Skip theNomad - it's rendered as a 6th label (derived from influence count)
				if (key === "theNomad") continue;

				const max = attr.max ?? configAttr.max ?? 5;

				// For ListMany, ensure we have options from the actor (current state) or config (defaults)
				let options = null;
				if (mergedType === "ListMany") {
					options = attr.options ?? configAttr.options ?? {};
				}

				// Get value - for Clock/Number types, ensure it's a number
				let value;
				if (mergedType === "LongText") {
					value = attr.value ?? "";
				} else if (mergedType === "Clock" || mergedType === "Number") {
					value = Number(attr.value) || 0;
				} else {
					value = attr.value;
				}

				const attrData = {
					key,
					type: mergedType,
					label: attr.label ?? configAttr.label ?? key,
					description: attr.description ?? configAttr.description,
					value: value,
					enriched: attr.enriched ?? value,
					attrName: `system.attributes.${key}.value`,
					max: max,
					options: options,
				};

				// For Clock types, prepare pips like potential (1-based for click handling)
				if (mergedType === "Clock") {
					attrData.pips = [];
					for (let i = 1; i <= max; i++) {
						attrData.pips.push({
							value: i,
							filled: i <= value,
						});
					}
				}

				// Split by type: Clock/Number go to sidebar, LongText/ListMany/Text go to tab
				if (mergedType === "Clock" || mergedType === "Number") {
					sidebarAttrs[key] = attrData;
					hasSidebar = true;
				} else {
					tabAttrs[key] = attrData;
					hasTab = true;
				}
			}

			return {
				sidebarAttrs: hasSidebar ? sidebarAttrs : null,
				tabAttrs: hasTab ? tabAttrs : null,
			};
		}

		/** @override */
		async _render(force = false, options = {}) {
			// Save animation state before re-render
			const el = this.element?.[0];
			if (el) {
				const sheetBody = el.querySelector(".sheet-body");
				const graphContainer = el.querySelector(".labels-graph");

				if (sheetBody) this._scrollTop = (sheetBody as HTMLElement).scrollTop;
				if (graphContainer && this.actor?.id) {
					saveGraphAnimationState(`actor-${this.actor.id}`, graphContainer as HTMLElement);
				}

				// Save label bar states for animation from actual DOM elements
				const labelRows = el.querySelectorAll(".label-row");
				this._labelBarCache.clear();
				labelRows.forEach((row: Element) => {
					const stat = (row as HTMLElement).dataset.stat;
					if (stat) {
						const solidBar = row.querySelector(".label-bar-solid") as HTMLElement;
						const ghostBar = row.querySelector(".label-bar-ghost") as HTMLElement;
						// Capture ghost class for animation when removing bonus/penalty
						const ghostClass = ghostBar?.classList.contains("bonus") ? "bonus" :
							ghostBar?.classList.contains("penalty") ? "penalty" : "";
						this._labelBarCache.set(stat, {
							solidPercent: solidBar?.style.width || "50%",
							ghostWidth: ghostBar?.style.width || "0%",
							ghostLeft: ghostBar?.style.left || "50%",
							ghostClass,
						});
					}
				});
			}

			await super._render(force, options);

			// Restore state and animate after re-render
			const newEl = this.element?.[0];
			if (newEl) {
				const newSheetBody = newEl.querySelector(".sheet-body");
				if (newSheetBody && this._scrollTop > 0) {
					(newSheetBody as HTMLElement).scrollTop = this._scrollTop;
				}

				const newGraphContainer = newEl.querySelector(".labels-graph");
				if (newGraphContainer && this.actor?.id) {
					animateGraphFromSavedState(`actor-${this.actor.id}`, newGraphContainer as HTMLElement);
				}

				// Animate label bars from old to new values
				if (this._labelBarCache.size > 0) {
					const newLabelRows = newEl.querySelectorAll(".label-row");
					newLabelRows.forEach((row: Element) => {
						const stat = (row as HTMLElement).dataset.stat;
						const cached = stat ? this._labelBarCache.get(stat) : null;
						if (!cached) return;

						const solidBar = row.querySelector(".label-bar-solid") as HTMLElement;
						const ghostBar = row.querySelector(".label-bar-ghost") as HTMLElement;
						if (!solidBar || !ghostBar) return;

						// Read new values from inline styles
						const newSolidPercent = solidBar.style.width || "50%";
						const newGhostWidth = ghostBar.style.width || "0%";
						const newGhostLeft = ghostBar.style.left || "50%";

						// Skip if no change
						if (cached.solidPercent === newSolidPercent &&
							cached.ghostWidth === newGhostWidth &&
							cached.ghostLeft === newGhostLeft) return;

						// If ghost bar had a class but now doesn't, temporarily restore it for visible animation
						const needsTempClass = cached.ghostClass && !ghostBar.classList.contains("bonus") && !ghostBar.classList.contains("penalty");
						if (needsTempClass) {
							ghostBar.classList.add(cached.ghostClass);
						}

						// Disable transitions, set old values
						solidBar.style.transition = "none";
						ghostBar.style.transition = "none";
						solidBar.style.width = cached.solidPercent;
						ghostBar.style.width = cached.ghostWidth;
						ghostBar.style.left = cached.ghostLeft;

						// Double-RAF: wait for paint, then animate to new values
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								solidBar.style.transition = "";
								ghostBar.style.transition = "";
								solidBar.style.width = newSolidPercent;
								ghostBar.style.width = newGhostWidth;
								ghostBar.style.left = newGhostLeft;

								// Remove temp class after animation completes
								if (needsTempClass) {
									setTimeout(() => {
										ghostBar.classList.remove(cached.ghostClass);
									}, 400); // Match transition duration
								}
							});
						});
					});
				}
			}
		}

		/** @override */
		activateListeners(html) {
			super.activateListeners(html);

			// Only add custom listeners for character sheets
			if (this.actor?.type !== "character") return;

			// Labels graph click -> shift labels modal
			html.on("click", "[data-action='shift-labels']", this._onShiftLabelsClick.bind(this));

			// Label row click -> shift labels modal with prepopulated label
			html.on("click", "[data-action='shift-label']", this._onShiftLabelClick.bind(this));

			// Label rollable icon click -> roll 2d6 + label modifier
			html.on("click", "[data-action='roll-stat']", this._onRollStat.bind(this));

			// Stat lock toggle
			html.on("click", "[data-action='toggle-stat-lock']", this._onStatLockToggle.bind(this));

			// Resource/Modifier buttons (Forward/Ongoing/Playbook attrs)
			html.on("click", ".mod-btn[data-action]", this._onModifierClick.bind(this));

			// Forward/Ongoing toggle (click name to toggle between 0 and 1)
			html.on("click", "[data-action='toggle-forward']", this._onForwardToggle.bind(this));
			html.on("click", "[data-action='toggle-ongoing']", this._onOngoingToggle.bind(this));

			// Forward/Ongoing share to chat (click icon)
			html.on("click", "[data-action='share-forward']", this._onShareForward.bind(this));
			html.on("click", "[data-action='share-ongoing']", this._onShareOngoing.bind(this));

			// Potential (XP) radio pips
			html.on("click", ".potential-pip", this._onXpPipClick.bind(this));

			// Playbook clock radio pips (e.g., Doom Track)
			html.on("click", ".clock-pip", this._onClockPipClick.bind(this));

			// Influence controls
			html.on("click", "[data-action='create-influence']", this._onInfluenceCreate.bind(this));
			html.on("click", "[data-action='toggle-influence']", this._onInfluenceToggle.bind(this));
			html.on("click", "[data-action='toggle-influence-lock']", this._onInfluenceLock.bind(this));
			html.on("click", "[data-action='delete-influence']", this._onInfluenceDelete.bind(this));
			html.on("change", ".influence--name", this._onInfluenceNameChange.bind(this));

			// View playbook
			html.on("click", ".view-playbook", this._onPlaybookLink.bind(this));
		}

		/**
		 * Handle XP/Potential pip click - fills up to clicked pip or reduces if clicking highest filled
		 */
		async _onXpPipClick(event) {
			event.preventDefault();
			event.stopPropagation();
			const pip = event.currentTarget;
			const stepIndex = Number(pip.dataset.step);
			if (isNaN(stepIndex)) return;

			const current = Number(this.actor.system.attributes?.xp?.value) || 0;
			const clickedValue = stepIndex + 1; // steps are 0-indexed, value is 1-indexed

			// If clicking on the currently filled max pip, reduce by one
			// Otherwise, set to the clicked value
			const newValue = (clickedValue === current) ? current - 1 : clickedValue;
			const clamped = Math.max(0, Math.min(5, newValue));

			await this.actor.update({ "system.attributes.xp.value": clamped });
		}

		/**
		 * Handle playbook clock pip click (e.g., Doom Track)
		 */
		async _onClockPipClick(event) {
			event.preventDefault();
			event.stopPropagation();
			const pip = event.currentTarget;
			const attrName = pip.dataset.name;
			const stepIndex = Number(pip.dataset.step);
			if (!attrName || isNaN(stepIndex)) return;

			// Extract the attribute key from the name (e.g., "system.attributes.doom" -> "doom")
			const keyMatch = attrName.match(/system\.attributes\.(\w+)/);
			if (!keyMatch) return;
			const attrKey = keyMatch[1];

			const current = Number(this.actor.system.attributes?.[attrKey]?.value) || 0;
			const clickedValue = stepIndex + 1;

			// If clicking on the currently filled max pip, reduce by one
			const newValue = (clickedValue === current) ? current - 1 : clickedValue;
			const clamped = Math.max(0, newValue);

			await this.actor.update({ [`system.attributes.${attrKey}.value`]: clamped });
		}

		/**
		 * Handle click on labels graph to open shift labels modal
		 */
		async _onShiftLabelsClick(event) {
			event.preventDefault();
			const { promptShiftLabels, applyShiftLabels } = await import("../helpers/shift-labels");
			const result = await promptShiftLabels(this.actor, `Shift Labels: ${this.actor.name}`);
			if (result) {
				await applyShiftLabels(this.actor, result.up, result.down);
			}
		}

		/**
		 * Handle click on a label row to open shift labels modal with that label prepopulated
		 * The entire row is clickable, but skip if clicking on interactive child elements
		 */
		async _onShiftLabelClick(event) {
			const target = event.target as HTMLElement;

			// Skip if clicking on interactive child elements (they have their own handlers)
			if (
				target.closest("[data-action='roll-stat']") ||
				target.closest("[data-action='toggle-stat-lock']") ||
				target.tagName === "INPUT"
			) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();

			const el = event.currentTarget as HTMLElement;
			const statKey = el.dataset.stat;
			if (!statKey) return;

			// Use actor data instead of DOM classes
			const labels = this._prepareLabels();
			const label = labels.find((l) => l.key === statKey);

			// Don't allow shifting if locked or can't shift in either direction
			if (!label || label.locked || (!label.canShiftUp && !label.canShiftDown)) {
				return;
			}

			const { promptShiftLabels, applyShiftLabels } = await import("../helpers/shift-labels");
			const result = await promptShiftLabels(this.actor, `Shift Labels: ${this.actor.name}`, statKey);
			if (result) {
				await applyShiftLabels(this.actor, result.up, result.down);
			}
		}

		/**
		 * Handle stat lock toggle
		 */
		async _onStatLockToggle(event) {
			event.preventDefault();
			event.stopPropagation();
			const el = event.currentTarget;
			const statKey = el.dataset.stat;
			if (!statKey) return;

			const currentLocked = this.actor.system.stats?.[statKey]?.locked ?? false;
			await this.actor.update({ [`system.stats.${statKey}.locked`]: !currentLocked });
		}

		/**
		 * Handle roll stat click - roll 2d6 + modifier
		 */
		async _onRollStat(event) {
			event.preventDefault();
			event.stopPropagation();
			const el = event.currentTarget;
			const mod = parseInt(el.dataset.mod ?? "0", 10);
			const label = el.dataset.label ?? "Stat";

			const roll = new Roll("2d6 + @mod", { mod });
			await roll.evaluate();
			await roll.toMessage({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				flavor: `<strong>${this.actor.name}</strong> rolls ${label}`,
			});
		}

		/**
		 * Handle Forward toggle - click to toggle between 0 and 1
		 * Active when value !== 0, clicking toggles: 0 -> 1, non-zero -> 0
		 */
		async _onForwardToggle(event) {
			const target = event.target as HTMLElement;
			// Skip if clicking on the share icon or input field
			if (target.closest("[data-action='share-forward']") || target.tagName === "INPUT") {
				return;
			}
			event.preventDefault();
			const current = Number(this.actor.system.resources?.forward?.value ?? 0);
			const newValue = current === 0 ? 1 : 0;
			await this.actor.update({ "system.resources.forward.value": newValue });
		}

		/**
		 * Handle Ongoing toggle - click to toggle between 0 and 1
		 * Active when value !== 0, clicking toggles: 0 -> 1, non-zero -> 0
		 */
		async _onOngoingToggle(event) {
			const target = event.target as HTMLElement;
			// Skip if clicking on the share icon or input field
			if (target.closest("[data-action='share-ongoing']") || target.tagName === "INPUT") {
				return;
			}
			event.preventDefault();
			const current = Number(this.actor.system.resources?.ongoing?.value ?? 0);
			const newValue = current === 0 ? 1 : 0;
			await this.actor.update({ "system.resources.ongoing.value": newValue });
		}

		/**
		 * Share Forward status to chat
		 */
		async _onShareForward(event) {
			event.preventDefault();
			event.stopPropagation();
			const value = Number(this.actor.system.resources?.forward?.value) || 0;
			const label = game.i18n.localize("PBTA.Forward");
			await ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				content: `<div class="pbta chat-card">
					<h3>${this.actor.name}</h3>
					<p><strong>${label}:</strong> ${value >= 0 ? "+" : ""}${value}</p>
				</div>`,
			});
		}

		/**
		 * Share Ongoing status to chat
		 */
		async _onShareOngoing(event) {
			event.preventDefault();
			event.stopPropagation();
			const value = Number(this.actor.system.resources?.ongoing?.value) || 0;
			const label = game.i18n.localize("PBTA.Ongoing");
			await ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				content: `<div class="pbta chat-card">
					<h3>${this.actor.name}</h3>
					<p><strong>${label}:</strong> ${value >= 0 ? "+" : ""}${value}</p>
				</div>`,
			});
		}

		/**
		 * Handle resource button click (Forward/Ongoing/Advances)
		 */
		async _onModifierClick(event) {
			event.preventDefault();
			event.stopPropagation();
			const btn = event.currentTarget;
			const action = btn.dataset.action;
			const attr = btn.dataset.attr;
			if (!action || !attr) return;

			const path = `system.${attr}`;
			const current = Number(foundry.utils.getProperty(this.actor, path)) || 0;
			const delta = action === "increase" ? 1 : -1;
			const newValue = current + delta;

			// Determine bounds based on attribute type
			let bounds = { min: -Infinity, max: Infinity };
			if (attr.includes("forward")) {
				bounds = MODIFIER_BOUNDS.forward;
			} else if (attr.includes("ongoing")) {
				bounds = MODIFIER_BOUNDS.ongoing;
			} else if (attr === "advancements") {
				bounds = { min: 0, max: 99 };
			}

			// Clamp to bounds
			const clamped = Math.max(bounds.min, Math.min(bounds.max, newValue));
			if (clamped === current) return; // No change needed

			await this.actor.update({ [path]: clamped });
		}


		/**
		 * Handle influence create
		 */
		async _onInfluenceCreate(event) {
			event.preventDefault();
			const influences = this.actor.getFlag(NS, "influences") ?? [];
			const newInfluence = {
				id: foundry.utils.randomID(16),
				name: "",
				hasInfluenceOver: false,
				haveInfluenceOver: false,
				locked: false,
			};
			await this.actor.setFlag(NS, "influences", [...influences, newInfluence]);
		}

		/**
		 * Handle influence toggle (has/have)
		 */
		async _onInfluenceToggle(event) {
			event.preventDefault();
			const el = event.currentTarget;
			const direction = el.dataset.direction;
			const item = el.closest("[data-influence-id]") ?? el.closest(".item");
			const influenceId = item?.dataset?.influenceId;
			if (!direction || !influenceId) return;

			const influences = foundry.utils.deepClone(this.actor.getFlag(NS, "influences") ?? []);
			const idx = influences.findIndex((i) => i.id === influenceId);
			if (idx < 0) return;

			// Check if influence is locked
			if (influences[idx].locked) return;

			influences[idx][direction] = !influences[idx][direction];
			await this.actor.setFlag(NS, "influences", influences);
		}

		/**
		 * Handle influence lock toggle
		 */
		async _onInfluenceLock(event) {
			event.preventDefault();
			const el = event.currentTarget;
			const item = el.closest("[data-influence-id]") ?? el.closest(".item");
			const influenceId = item?.dataset?.influenceId;
			if (!influenceId) return;

			const influences = foundry.utils.deepClone(this.actor.getFlag(NS, "influences") ?? []);
			const idx = influences.findIndex((i) => i.id === influenceId);
			if (idx < 0) return;

			influences[idx].locked = !influences[idx].locked;
			await this.actor.setFlag(NS, "influences", influences);
		}

		/**
		 * Handle influence delete
		 */
		async _onInfluenceDelete(event) {
			event.preventDefault();
			const el = event.currentTarget;
			const item = el.closest("[data-influence-id]") ?? el.closest(".item");
			const influenceId = item?.dataset?.influenceId;
			if (!influenceId) return;

			const influences = this.actor.getFlag(NS, "influences") ?? [];
			const influence = influences.find((i) => i.id === influenceId);

			// Don't delete locked influences
			if (influence?.locked) return;

			const filtered = influences.filter((i) => i.id !== influenceId);
			await this.actor.setFlag(NS, "influences", filtered);
		}

		/**
		 * Handle influence name change
		 */
		async _onInfluenceNameChange(event) {
			const input = event.currentTarget;
			const item = input.closest("[data-influence-id]") ?? input.closest(".item");
			const influenceId = item?.dataset?.influenceId;
			if (!influenceId) return;

			const influences = foundry.utils.deepClone(this.actor.getFlag(NS, "influences") ?? []);
			const idx = influences.findIndex((i) => i.id === influenceId);
			if (idx < 0) return;

			influences[idx].name = input.value;
			await this.actor.setFlag(NS, "influences", influences);
		}

		/**
		 * Handle playbook view click
		 */
		async _onPlaybookLink(event) {
			event.preventDefault();
			event.stopPropagation();
			const btn = event.currentTarget;
			const playbookUuid = btn.dataset.playbook;
			if (!playbookUuid) return;

			const playbook = await fromUuid(playbookUuid);
			if (playbook) {
				playbook.sheet.render(true);
			}
		}
	};
}
