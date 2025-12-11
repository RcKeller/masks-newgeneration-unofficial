import { createLabelsGraphData, LABEL_ORDER } from "../labels-graph.mjs";

const NS = "masks-newgeneration-unofficial";

/**
 * Label configuration with icons and colors
 */
const LABEL_CONFIG = Object.freeze({
	danger: {
		key: "danger",
		icon: "fa-solid fa-fire",
		color: "danger",
	},
	freak: {
		key: "freak",
		icon: "fa-solid fa-burst",
		color: "freak",
	},
	savior: {
		key: "savior",
		icon: "fa-solid fa-shield-heart",
		color: "savior",
	},
	superior: {
		key: "superior",
		icon: "fa-solid fa-crown",
		color: "superior",
	},
	mundane: {
		key: "mundane",
		icon: "fa-solid fa-user",
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
			});
		}

		/** @override */
		async getData() {
			const context = await super.getData();

			// Only add v2 data for character sheets
			if (this.actor?.type === "character") {
				// Labels graph data (for the pentagon visualization)
				context.labelsGraph = createLabelsGraphData(this.actor, {
					size: 100,
					borderWidth: 2,
					showInnerLines: true,
					showVertexDots: false,
				});

				// Prepare label rows for the sidebar
				context.labelRows = this._prepareLabelRows();

				// Prepare condition tags
				context.conditionTags = this._prepareConditionTags();

				// Prepare playbook-specific attributes for sidebar
				context.playbookAttributes = this._preparePlaybookAttributes();
			}

			return context;
		}

		/**
		 * Prepare label data for template rendering
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
					atMin: value <= -3,
					atMax: value >= 4,
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
		 * Prepare playbook-specific attributes for sidebar
		 * @returns {Object|null} Playbook attributes or null if none
		 */
		_preparePlaybookAttributes() {
			const attrs = this.actor.system.attributes ?? {};
			const playbook = this.actor.system.playbook?.name ?? "";
			const result = {};
			let hasAny = false;

			for (const [key, attr] of Object.entries(attrs)) {
				// Skip non-playbook attributes
				if (!attr.playbook || attr.playbook === true) continue;
				// Skip if playbook doesn't match
				if (attr.playbook && attr.playbook !== playbook) continue;
				// Skip position=Left attributes (they go elsewhere)
				if (attr.position === "Left") continue;

				result[key] = {
					key,
					type: attr.type,
					label: attr.label,
					value: attr.value,
					max: attr.max,
					options: attr.options,
				};
				hasAny = true;
			}

			return hasAny ? result : null;
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

			// Modifier buttons (Forward/Ongoing)
			html.on("click", ".modifier-btn", this._onModifierClick.bind(this));

			// Clock pips (playbook attributes)
			html.on("click", ".clock-pip", this._onClockPipClick.bind(this));

			// Playbook attribute steppers
			html.on("click", ".playbook-attr .attr-btn", this._onAttrStepperClick.bind(this));

			// Move group collapse
			html.on("click", ".moves-group-header", this._onMoveGroupCollapse.bind(this));

			// Move actions
			html.on("click", ".move-share", this._onMoveShare.bind(this));
			html.on("click", ".move-roll", this._onMoveRoll.bind(this));
			html.on("click", ".move-edit", this._onMoveEdit.bind(this));
			html.on("click", ".move-delete", this._onMoveDelete.bind(this));

			// Move header click to expand description
			html.on("click", ".move-header .move-name", this._onMoveHeaderClick.bind(this));

			// Influence controls
			html.on("click", "[data-action='create-influence']", this._onInfluenceCreate.bind(this));
			html.on("click", "[data-action='toggle-influence']", this._onInfluenceToggle.bind(this));
			html.on("click", "[data-action='toggle-influence-lock']", this._onInfluenceLock.bind(this));
			html.on("click", "[data-action='delete-influence']", this._onInfluenceDelete.bind(this));
			html.on("change", ".influence-name-input", this._onInfluenceNameChange.bind(this));

			// Playbook link
			html.on("click", ".playbook-link", this._onPlaybookLink.bind(this));

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
		 */
		async _onLabelIncrement(event) {
			event.preventDefault();
			event.stopPropagation();
			const btn = event.currentTarget;
			const label = btn.dataset.label;
			if (!label) return;

			const path = `system.stats.${label}.value`;
			const current = Number(foundry.utils.getProperty(this.actor, path)) || 0;
			if (current >= 4) return;

			await this.actor.update({ [path]: current + 1 });
		}

		/**
		 * Handle label decrement
		 */
		async _onLabelDecrement(event) {
			event.preventDefault();
			event.stopPropagation();
			const btn = event.currentTarget;
			const label = btn.dataset.label;
			if (!label) return;

			const path = `system.stats.${label}.value`;
			const current = Number(foundry.utils.getProperty(this.actor, path)) || 0;
			if (current <= -3) return;

			await this.actor.update({ [path]: current - 1 });
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
		 * Handle clock pip click (e.g., Doom Track)
		 */
		async _onClockPipClick(event) {
			event.preventDefault();
			const pip = event.currentTarget;
			const pipValue = Number(pip.dataset.pip);
			const attrKey = pip.dataset.attr;
			if (isNaN(pipValue) || !attrKey) return;

			const path = `system.attributes.${attrKey}.value`;
			const current = Number(foundry.utils.getProperty(this.actor, path)) || 0;
			// Toggle: if clicking current max, decrease; otherwise set to clicked value
			const newValue = pipValue === current ? current - 1 : pipValue;

			await this.actor.update({ [path]: Math.max(0, newValue) });
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
		 * Handle move share in chat
		 */
		async _onMoveShare(event) {
			event.preventDefault();
			event.stopPropagation();
			const itemId = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
			const item = this.actor.items.get(itemId);
			if (item) {
				await item.toChat();
			}
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

		/**
		 * Handle tab click
		 */
		_onTabClick(event) {
			event.preventDefault();
			const btn = event.currentTarget;
			const tabId = btn.dataset.tab;
			if (!tabId) return;

			const form = btn.closest("form");
			if (!form) return;

			// Update tab buttons
			form.querySelectorAll(".tab-btn").forEach((t) => t.classList.remove("active"));
			btn.classList.add("active");

			// Update tab content
			form.querySelectorAll(".tab-content > .tab").forEach((t) => {
				t.classList.toggle("active", t.dataset.tab === tabId);
			});
		}
	};
}
