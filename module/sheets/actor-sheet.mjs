/* global ChatMessage, CONST, Dialog, game, foundry, ui */
import { createLabelsGraphData, LABEL_ORDER } from "../labels-graph.mjs";

const NS = "masks-newgeneration-unofficial";

/**
 * Label configuration with icons and colors
 */
const LABEL_CONFIG = Object.freeze({
	danger: {
		key: "danger",
		icon: "fa-solid fa-hand-fist",
		color: "danger",
	},
	freak: {
		key: "freak",
		icon: "fa-solid fa-hat-wizard",
		color: "freak",
	},
	savior: {
		key: "savior",
		icon: "fa-solid fa-shield-heart",
		color: "savior",
	},
	superior: {
		key: "superior",
		icon: "fa-solid fa-graduation-cap",
		color: "superior",
	},
	mundane: {
		key: "mundane",
		icon: "fa-solid fa-hat-cowboy",
		color: "mundane",
	},
});

/**
 * Condition configuration with icons and affected labels
 */
const CONDITION_CONFIG = Object.freeze({
	0: { key: "afraid", icon: "fa-solid fa-ghost", cssClass: "afraid", affectsLabel: "danger", tooltip: "-2 Danger" },
	1: { key: "angry", icon: "fa-solid fa-face-angry", cssClass: "angry", affectsLabel: "mundane", tooltip: "-2 Mundane" },
	2: { key: "guilty", icon: "fa-solid fa-scale-unbalanced", cssClass: "guilty", affectsLabel: "superior", tooltip: "-2 Superior" },
	3: { key: "hopeless", icon: "fa-solid fa-heart-crack", cssClass: "hopeless", affectsLabel: "freak", tooltip: "-2 Freak" },
	4: { key: "insecure", icon: "fa-solid fa-face-frown-open", cssClass: "insecure", affectsLabel: "savior", tooltip: "-2 Savior" },
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
				tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".tab-content", initial: "info" }],
			});
		}

		/**
		 * Track the currently active tab
		 * @type {string}
		 */
		_activeTab = "info";

		/**
		 * Track scroll position for restoration
		 * @type {number}
		 */
		_scrollTop = 0;

		/** @override */
		async getData() {
			const context = await super.getData();

			// Pass the active tab to template
			context.activeTab = this._activeTab;

			// Only add v2 data for character sheets
			if (this.actor?.type === "character") {
				// Labels graph data (for the pentagon visualization)
				context.labelsGraph = createLabelsGraphData(this.actor, {
					size: 100,
					borderWidth: 2,
					showInnerLines: true,
					showIcons: true,
				});

				// Prepare label rows for the sidebar
				context.labelRows = this._prepareLabelRows();

				// Prepare condition tags
				context.conditionTags = this._prepareConditionTags();

				// Prepare playbook-specific attributes split between sidebar and playbook tab
				// Sidebar: Clock and Number types (e.g., Doom Track, Soldier's Fight)
				// Playbook tab: LongText and ListMany types (e.g., Sanctuary description)
				const { sidebarAttrs, tabAttrs } = this._prepareSplitPlaybookAttributes();
				context.playbookSidebarAttrs = sidebarAttrs;
				context.playbookAttributes = tabAttrs;

				// Prepare potential pips (1-based for correct display and click handling)
				const xpValue = Number(this.actor.system.attributes?.xp?.value) || 0;
				context.potentialPips = [1, 2, 3, 4, 5].map((v) => ({
					value: v,
					filled: v <= xpValue,
				}));
			}

			return context;
		}

		/**
		 * Prepare label data for template rendering
		 * Normal label range: -2 to +3 (via shifts)
		 * Roll modifier caps: -3 to +4
		 * @returns {Object} Label rows keyed by label name
		 */
		_prepareLabelRows() {
			const stats = this.actor.system.stats ?? {};
			const lockedLabels = this.actor.getFlag(NS, "lockedLabels") ?? {};
			const rows = {};

			for (const key of LABEL_ORDER) {
				const config = LABEL_CONFIG[key];
				const value = Number(stats[key]?.value) || 0;
				const displayName = stats[key]?.label ?? game.i18n.localize(`MASKS-SHEETS.CharacterSheets.stats.${key}`);

				rows[key] = {
					key,
					value,
					displayName,
					icon: config.icon,
					color: config.color,
					isLocked: !!lockedLabels[key],
					// Normal shift range: -2 to +3
					atMin: value <= -2,
					atMax: value >= 3,
				};
			}

			return rows;
		}

		/**
		 * Prepare condition tags for template rendering
		 * @returns {Object} Condition tags keyed by condition index
		 */
		_prepareConditionTags() {
			const conditions = this.actor.system.attributes?.conditions?.options ?? {};
			const tags = {};

			for (const [idx, opt] of Object.entries(conditions)) {
				const config = CONDITION_CONFIG[idx];
				if (!config) continue;

				// Extract just the condition name from labels like "Afraid (-2 Danger)"
				const rawLabel = opt.label ?? "";
				const cleanLabel = rawLabel.split("(")[0].trim();

				tags[idx] = {
					key: config.key,
					label: cleanLabel,
					icon: config.icon,
					cssClass: config.cssClass,
					value: !!opt.value,
					tooltip: config.tooltip,
					affectsLabel: config.affectsLabel,
				};
			}

			return tags;
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
			// Save scroll position before re-render
			const tabContent = this.element?.[0]?.querySelector(".tab-content");
			if (tabContent) {
				this._scrollTop = tabContent.scrollTop;
			}

			// Save active tab
			const activeTabBtn = this.element?.[0]?.querySelector(".tab-btn.active");
			if (activeTabBtn?.dataset.tab) {
				this._activeTab = activeTabBtn.dataset.tab;
			}

			await super._render(force, options);

			// Restore scroll position after render
			const newTabContent = this.element?.[0]?.querySelector(".tab-content");
			if (newTabContent && this._scrollTop > 0) {
				newTabContent.scrollTop = this._scrollTop;
			}

			// Restore active tab
			this._restoreActiveTab();
		}

		/**
		 * Restore the active tab after re-render
		 */
		_restoreActiveTab() {
			const html = this.element;
			if (!html?.length) return;

			const form = html[0];
			const tabBtn = form.querySelector(`.tab-btn[data-tab="${this._activeTab}"]`);
			if (!tabBtn) return;

			// Update tab buttons
			form.querySelectorAll(".tab-btn").forEach((t) => t.classList.remove("active"));
			tabBtn.classList.add("active");

			// Update tab content
			form.querySelectorAll(".tab-content > .tab").forEach((t) => {
				t.classList.toggle("active", t.dataset.tab === this._activeTab);
			});
		}

		/** @override */
		activateListeners(html) {
			super.activateListeners(html);

			// Only add v2 listeners for character sheets
			if (this.actor?.type !== "character") return;

			// Condition tag toggle
			html.on("click", ".condition-tag", this._onConditionToggle.bind(this));

			// Label controls
			html.on("click", ".label-increment", this._onLabelIncrement.bind(this));
			html.on("click", ".label-decrement", this._onLabelDecrement.bind(this));
			html.on("click", ".label-lock", this._onLabelLock.bind(this));

			// Labels graph click -> shift labels modal
			html.on("click", ".labels-graph-clickable", this._onShiftLabelsClick.bind(this));

			// Potential pips
			html.on("click", ".potential-pip", this._onPotentialClick.bind(this));

			// Clock pips (sidebar playbook attributes like Doom Track)
			html.on("click", ".clock-pip", this._onClockPipClick.bind(this));

			// Modifier buttons (Forward/Ongoing)
			html.on("click", ".modifier-btn", this._onModifierClick.bind(this));

			// Playbook attribute steppers (both old .attr-btn and new .tracker-btn)
			html.on("click", ".tracker-btn, .attr-btn", this._onAttrStepperClick.bind(this));

			// Move group collapse
			html.on("click", ".moves-group-header", this._onMoveGroupCollapse.bind(this));

			// Move actions
			html.on("click", ".move-icon", this._onMoveIconClick.bind(this));
			html.on("click", ".move-share", this._onMoveShare.bind(this));
			html.on("click", ".move-roll", this._onMoveRoll.bind(this));
			html.on("click", ".move-edit", this._onMoveEdit.bind(this));
			html.on("click", ".move-delete", this._onMoveDelete.bind(this));

			// Move header click to expand description
			html.on("click", ".move-header .move-name", this._onMoveHeaderClick.bind(this));

			// Add move button
			html.on("click", ".moves-add-btn", this._onAddMove.bind(this));

			// Influence controls
			html.on("click", "[data-action='create-influence']", this._onInfluenceCreate.bind(this));
			html.on("click", "[data-action='toggle-influence']", this._onInfluenceToggle.bind(this));
			html.on("click", "[data-action='toggle-influence-lock']", this._onInfluenceLock.bind(this));
			html.on("click", "[data-action='delete-influence']", this._onInfluenceDelete.bind(this));
			html.on("change", ".influence-name-input", this._onInfluenceNameChange.bind(this));

			// Playbook link
			html.on("click", ".playbook-link", this._onPlaybookLink.bind(this));

			// NOTE: Playbook select uses class="charplaybook" and is handled by PbtA's base sheet
			// Do NOT add a custom handler - PbtA handles playbook changes including choices/grants

			// Tab handling
			html.on("click", ".tab-btn", this._onTabClick.bind(this));
		}

		/**
		 * Handle condition tag toggle
		 */
		async _onConditionToggle(event) {
			event.preventDefault();
			const btn = event.currentTarget;
			const conditionKey = btn.dataset.conditionKey;
			if (!conditionKey) return;

			const path = `system.attributes.conditions.options.${conditionKey}.value`;
			const current = foundry.utils.getProperty(this.actor, path);
			await this.actor.update({ [path]: !current });
		}

		/**
		 * Handle label increment
		 * Normal label range: -2 to +3 (via shifts)
		 * Roll modifier caps: -3 to +4
		 * Advances can push a label to +4, but not via normal shifts
		 */
		async _onLabelIncrement(event) {
			event.preventDefault();
			event.stopPropagation();
			const btn = event.currentTarget;
			const label = btn.dataset.label;
			if (!label) return;

			// Check if label is locked
			const lockedLabels = this.actor.getFlag(NS, "lockedLabels") ?? {};
			if (lockedLabels[label]) return;

			const path = `system.stats.${label}.value`;
			const current = Number(foundry.utils.getProperty(this.actor, path)) || 0;
			// Normal shift cap is +3 (advances can push to +4)
			if (current >= 3) return;

			// Trigger shift-up animation
			this._animateLabelShift(label, "up");

			await this.actor.update({ [path]: current + 1 });
		}

		/**
		 * Handle label decrement
		 * Normal label range: -2 to +3 (via shifts)
		 * Roll modifier caps: -3 to +4
		 */
		async _onLabelDecrement(event) {
			event.preventDefault();
			event.stopPropagation();
			const btn = event.currentTarget;
			const label = btn.dataset.label;
			if (!label) return;

			// Check if label is locked
			const lockedLabels = this.actor.getFlag(NS, "lockedLabels") ?? {};
			if (lockedLabels[label]) return;

			const path = `system.stats.${label}.value`;
			const current = Number(foundry.utils.getProperty(this.actor, path)) || 0;
			// Normal shift minimum is -2 (roll cap is -3)
			if (current <= -2) return;

			// Trigger shift-down animation
			this._animateLabelShift(label, "down");

			await this.actor.update({ [path]: current - 1 });
		}

		/**
		 * Animate label value shift
		 * @param {string} label - The label key
		 * @param {string} direction - "up" or "down"
		 */
		_animateLabelShift(label, direction) {
			const labelRow = this.element?.[0]?.querySelector(`.label-row.label--${label}`);
			if (!labelRow) return;

			const valueInput = labelRow.querySelector(".label-value");
			if (!valueInput) return;

			// Remove any existing animation class
			valueInput.classList.remove("shifting-up", "shifting-down");

			// Force reflow to restart animation
			void valueInput.offsetWidth;

			// Add the animation class
			valueInput.classList.add(`shifting-${direction}`);

			// Remove class after animation completes
			setTimeout(() => {
				valueInput.classList.remove(`shifting-${direction}`);
			}, 300);
		}

		/**
		 * Handle label lock toggle
		 */
		async _onLabelLock(event) {
			event.preventDefault();
			event.stopPropagation();
			const btn = event.currentTarget;
			const label = btn.dataset.label;
			if (!label) return;

			const lockedLabels = this.actor.getFlag(NS, "lockedLabels") ?? {};
			const newLocked = { ...lockedLabels, [label]: !lockedLabels[label] };
			await this.actor.setFlag(NS, "lockedLabels", newLocked);
		}

		/**
		 * Handle click on labels graph to open shift labels modal
		 */
		async _onShiftLabelsClick(event) {
			event.preventDefault();
			// Import and use the shift labels modal from turn-cards
			// For now, show a simple dialog
			const { promptShiftLabels, applyShiftLabels } = await import("../turn-cards.mjs");
			const result = await promptShiftLabels(this.actor, `Shift Labels: ${this.actor.name}`);
			if (result) {
				await applyShiftLabels(this.actor, result.up, result.down);
			}
		}

		/**
		 * Handle potential pip click
		 */
		async _onPotentialClick(event) {
			event.preventDefault();
			const pip = event.currentTarget;
			const pipValue = Number(pip.dataset.pip);
			if (isNaN(pipValue)) return;

			const current = Number(this.actor.system.attributes?.xp?.value) || 0;
			// If clicking on the current value, decrease; otherwise set to clicked value
			const newValue = pipValue === current ? current - 1 : pipValue;
			const clamped = Math.max(0, Math.min(5, newValue));

			await this.actor.update({ "system.attributes.xp.value": clamped });
		}

		/**
		 * Handle clock pip click (for playbook attributes like Doom Track)
		 * Works like potential pips - click to fill up to that pip, click current to decrease
		 */
		async _onClockPipClick(event) {
			event.preventDefault();
			const pip = event.currentTarget;
			const pipValue = Number(pip.dataset.pip);
			const attrKey = pip.dataset.attr;
			if (isNaN(pipValue) || !attrKey) return;

			const path = `system.attributes.${attrKey}.value`;
			const current = Number(foundry.utils.getProperty(this.actor, path)) || 0;
			// If clicking on the current value, decrease; otherwise set to clicked value
			const newValue = pipValue === current ? current - 1 : pipValue;
			const clamped = Math.max(0, newValue);

			await this.actor.update({ [path]: clamped });
		}

		/**
		 * Handle modifier button click (Forward/Ongoing)
		 */
		async _onModifierClick(event) {
			event.preventDefault();
			const btn = event.currentTarget;
			const action = btn.dataset.action;
			const attr = btn.dataset.attr;
			if (!action || !attr) return;

			const path = `system.${attr}`;
			const current = Number(foundry.utils.getProperty(this.actor, path)) || 0;
			const delta = action === "increase" ? 1 : -1;

			await this.actor.update({ [path]: current + delta });
		}


		/**
		 * Handle playbook attribute stepper click
		 */
		async _onAttrStepperClick(event) {
			event.preventDefault();
			const btn = event.currentTarget;
			const action = btn.dataset.action;
			const attr = btn.dataset.attr;
			if (!action || !attr) return;

			const path = `system.${attr}`;
			const current = Number(foundry.utils.getProperty(this.actor, path)) || 0;
			const delta = action === "increase" ? 1 : -1;

			await this.actor.update({ [path]: current + delta });
		}

		/**
		 * Handle move group collapse toggle
		 */
		_onMoveGroupCollapse(event) {
			// Don't collapse if clicking the add button
			if (event.target.closest(".moves-add-btn")) return;

			const header = event.currentTarget;
			const group = header.closest(".moves-group");
			if (group) {
				group.classList.toggle("collapsed");
			}
		}

		/**
		 * Handle move icon click - rolls if rollable, otherwise shares to chat
		 */
		async _onMoveIconClick(event) {
			event.preventDefault();
			event.stopPropagation();
			const icon = event.currentTarget;
			const action = icon.dataset.action;
			const itemId = icon.closest("[data-item-id]")?.dataset.itemId;
			const item = this.actor.items.get(itemId);
			if (!item) return;

			if (action === "roll-move") {
				await item.roll();
			} else {
				await this._shareMoveToChat(item);
			}
		}

		/**
		 * Handle move share in chat
		 */
		async _onMoveShare(event) {
			event.preventDefault();
			event.stopPropagation();
			const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
			const item = this.actor.items.get(itemId);
			if (item) {
				await this._shareMoveToChat(item);
			}
		}

		/**
		 * Share a move to chat as a chat card
		 * @param {Item} item - The move item to share
		 */
		async _shareMoveToChat(item) {
			const content = `
				<div class="move-card">
					<header class="card-header">
						<img src="${item.img}" alt="${item.name}" width="36" height="36" />
						<h3 class="move-name">${item.name}</h3>
					</header>
					${item.system.description ? `<div class="card-content">${item.system.description}</div>` : ""}
				</div>
			`;

			await ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor: this.actor }),
				content: content,
				type: CONST.CHAT_MESSAGE_TYPES.OTHER,
			});
		}

		/**
		 * Handle move roll
		 */
		async _onMoveRoll(event) {
			event.preventDefault();
			event.stopPropagation();
			const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
			const item = this.actor.items.get(itemId);
			if (item) {
				await item.roll();
			}
		}

		/**
		 * Handle move edit
		 */
		_onMoveEdit(event) {
			event.preventDefault();
			event.stopPropagation();
			const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
			const item = this.actor.items.get(itemId);
			if (item) {
				item.sheet.render(true);
			}
		}

		/**
		 * Handle move delete
		 */
		async _onMoveDelete(event) {
			event.preventDefault();
			event.stopPropagation();
			const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
			const item = this.actor.items.get(itemId);
			if (item) {
				const confirmed = await Dialog.confirm({
					title: game.i18n.localize("PBTA.Delete"),
					content: `<p>Delete ${item.name}?</p>`,
				});
				if (confirmed) {
					await item.delete();
				}
			}
		}

		/**
		 * Handle move header click to expand/collapse description
		 */
		_onMoveHeaderClick(event) {
			const moveItem = event.currentTarget.closest(".move-item");
			if (!moveItem) return;

			const description = moveItem.querySelector(".move-description");
			if (description) {
				description.classList.toggle("collapsed");
			}
		}

		/**
		 * Handle add move button click
		 */
		async _onAddMove(event) {
			event.preventDefault();
			event.stopPropagation();
			const btn = event.currentTarget;
			const moveType = btn.dataset.moveType ?? "playbook";

			// Create a new move item with localized name
			const moveTypeName = game.pbta.sheetConfig?.actorTypes?.character?.moveTypes?.[moveType]?.label
				?? game.i18n.localize("PBTA.Move");
			const newMoveName = `New ${moveTypeName}`;

			const itemData = {
				name: newMoveName,
				type: "move",
				system: {
					moveType: moveType,
					description: "",
				},
			};

			const [newItem] = await this.actor.createEmbeddedDocuments("Item", [itemData]);
			if (newItem) {
				newItem.sheet.render(true);
			}
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
			const btn = event.currentTarget;
			const direction = btn.dataset.direction;
			const item = btn.closest("[data-influence-id]");
			const influenceId = item?.dataset.influenceId;
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
			const item = event.currentTarget.closest("[data-influence-id]");
			const influenceId = item?.dataset.influenceId;
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
			const item = event.currentTarget.closest("[data-influence-id]");
			const influenceId = item?.dataset.influenceId;
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
			const item = input.closest("[data-influence-id]");
			const influenceId = item?.dataset.influenceId;
			if (!influenceId) return;

			const influences = foundry.utils.deepClone(this.actor.getFlag(NS, "influences") ?? []);
			const idx = influences.findIndex((i) => i.id === influenceId);
			if (idx < 0) return;

			influences[idx].name = input.value;
			await this.actor.setFlag(NS, "influences", influences);
		}

		/**
		 * Handle playbook link click
		 */
		async _onPlaybookLink(event) {
			event.preventDefault();
			const btn = event.currentTarget;
			const playbookUuid = btn.dataset.playbook;
			if (!playbookUuid) return;

			const playbook = await fromUuid(playbookUuid);
			if (playbook) {
				playbook.sheet.render(true);
			}
		}

		// NOTE: Playbook change is handled entirely by PbtA's base sheet via class="charplaybook"
		// PbtA handles: setPlaybook(), handleChoices(), grantChoices(), and all dialogs

		/**
		 * Handle tab click
		 */
		_onTabClick(event) {
			event.preventDefault();
			const btn = event.currentTarget;
			const tabId = btn.dataset.tab;
			if (!tabId) return;

			// Save the active tab
			this._activeTab = tabId;

			const form = btn.closest("form");
			if (!form) return;

			// Update tab buttons
			form.querySelectorAll(".tab-btn").forEach((t) => t.classList.remove("active"));
			btn.classList.add("active");

			// Update tab content
			form.querySelectorAll(".tab-content > .tab").forEach((t) => {
				t.classList.toggle("active", t.dataset.tab === tabId);
			});

			// Reset scroll position when switching tabs
			const tabContent = form.querySelector(".tab-content");
			if (tabContent) {
				tabContent.scrollTop = 0;
				this._scrollTop = 0;
			}
		}
	};
}
