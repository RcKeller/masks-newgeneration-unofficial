import { createLabelsGraphData } from "../labels-graph.mjs";

/**
 * Label abbreviations for the sidebar display
 */
const LABEL_ABBREVS = {
	danger: "DNG",
	freak: "FRK",
	savior: "SAV",
	superior: "SUP",
	mundane: "MUN"
};

/**
 * Playbook-specific attribute keys - attributes that should only show for specific playbooks
 */
const PLAYBOOK_SPECIFIC_ATTRS = [
	"theDoomed", "theBull", "theNova", "theProtege", "theSoldier",
	"theHarbingerMemories", "theNomad", "theBrain", "bringsDoomCloser",
	"doomedSanctuaryFeatures", "doomedSanctuaryDownsides",
	"theScionGreatestEnemy", "theScionGreatestVictim", "theScionPersonalIdol",
	"theScionGreatestLeader", "theScionGreatestHero", "theScionBiggestCelebrity",
	"theHarbinger", "theStarAdvantages", "theStarDemands", "theInnocent",
	"theNewborn", "theReformed", "theJanus", "theProtegeMentorsResources",
	"theLegacy", "theBeacon"
];

/**
 * Extract the condition name from a label like "Angry (-2 to comfort or pierce)"
 */
function extractConditionName(label) {
	const match = label?.match(/^([^(]+)/);
	return match ? match[1].trim() : label;
}

export function MasksActorSheetMixin(Base) {
	return class MasksActorSheet extends Base {
		/** @override */
		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				classes: ["pbta", "sheet", "actor", "masks-redesign"],
				tabs: [{
					navSelector: ".sheet-tabs",
					contentSelector: ".sheet-body",
					initial: "info"
				}],
				width: 1050,
				height: 750
			});
		}

		/** @override */
		get template() {
			return 'modules/masks-newgeneration-unofficial/templates/sheets/actor-sheet.hbs';
		}

		/** @override */
		async getData() {
			const context = await super.getData();

			// Determine actor type
			context.isCharacter = this.actor?.type === "character";
			context.isNPC = this.actor?.type === "npc";

			if (context.isCharacter) {
				// Add labels graph data for sidebar (larger size)
				context.labelsGraph = createLabelsGraphData(this.actor, {
					size: 120,
					borderWidth: 2,
					showInnerLines: true,
					showVertexDots: true,
					tooltip: game.i18n.localize("MASKS-SHEETS.ClickToShiftLabels")
				});

				// Prepare label stats with abbreviations and lock status
				context.labelStats = this._prepareLabelStats();

				// Prepare playbook-specific attributes
				context.playbookAttributes = this._preparePlaybookAttributes();

				// Prepare moves in the correct order (playbook first)
				context.movesOrdered = this._prepareMovesOrdered(context.moves);

				// Check if character can advance
				context.canAdvance = this._canAdvance();

				// Get sheet settings
				context.sheetSettings = {
					hideForward: game.settings.get("pbta", "hideForward") ?? false,
					hideOngoing: game.settings.get("pbta", "hideOngoing") ?? false,
					hideRollFormula: game.settings.get("pbta", "hideRollFormula") ?? true,
					hideRollMode: game.settings.get("pbta", "hideRollMode") ?? true,
					hideHold: game.settings.get("pbta", "hideHold") ?? true
				};
			}

			return context;
		}

		/**
		 * Prepare label stats with abbreviations and lock states
		 * @returns {Object}
		 */
		_prepareLabelStats() {
			const stats = this.actor.system?.stats ?? {};
			const result = {};

			for (const [key, stat] of Object.entries(stats)) {
				result[key] = {
					...stat,
					abbrev: LABEL_ABBREVS[key] || key.substring(0, 3).toUpperCase(),
					locked: stat.toggle ?? false,
					value: stat.value ?? 0
				};
			}

			return result;
		}

		/**
		 * Filter attributes to only show playbook-specific ones for the current playbook
		 * @returns {Object}
		 */
		_preparePlaybookAttributes() {
			const attrs = this.actor.system?.attributes ?? {};
			const currentPlaybook = this.actor.system?.playbook?.name ?? "";
			const result = {};

			for (const [key, attr] of Object.entries(attrs)) {
				// Skip non-playbook-specific attributes (they're shown elsewhere)
				if (!PLAYBOOK_SPECIFIC_ATTRS.includes(key)) continue;

				// Skip if this attribute is for a different playbook
				if (attr.playbook && attr.playbook !== currentPlaybook && attr.playbook !== true) continue;

				// Prepare the attribute data
				result[key] = {
					...attr,
					attrName: `system.attributes.${key}.value`,
					enriched: attr.value // Will need async enrichment for LongText
				};
			}

			return result;
		}

		/**
		 * Reorder moves: playbook first, then basic, adult, rules
		 * @param {Object} moves - Original moves object
		 * @returns {Object}
		 */
		_prepareMovesOrdered(moves) {
			if (!moves) return {};

			const order = ["playbook", "basic", "adult", "rules", "PBTA_OTHER"];
			const result = {};

			// Add moves in the specified order
			for (const key of order) {
				if (moves[key] && moves[key].length > 0) {
					result[key] = moves[key];
				}
			}

			// Add any remaining move types not in the order
			for (const [key, group] of Object.entries(moves)) {
				if (!result[key] && group && group.length > 0) {
					result[key] = group;
				}
			}

			return result;
		}

		/**
		 * Check if character can advance (has enough potential)
		 * @returns {boolean}
		 */
		_canAdvance() {
			const xp = this.actor.system?.attributes?.xp;
			if (!xp) return false;
			return (xp.value ?? 0) >= (xp.max ?? 5);
		}

		/** @override */
		activateListeners(html) {
			super.activateListeners(html);

			if (!this.isEditable) return;

			// Labels graph click - trigger label shifting
			html.find(".labels-graph-container").on("click", this._onLabelsGraphClick.bind(this));

			// Label lock toggle
			html.find("[data-action='toggle-lock']").on("click", this._onToggleLabelLock.bind(this));

			// Label shift buttons
			html.find("[data-action='shift']").on("click", this._onLabelShift.bind(this));

			// Resource +/- buttons
			html.find("[data-action='increase']").on("click", this._onResourceChange.bind(this, 1));
			html.find("[data-action='decrease']").on("click", this._onResourceChange.bind(this, -1));

			// Condition tag clicks
			html.find(".condition-tag").on("click", this._onConditionToggle.bind(this));

			// View playbook button
			html.find(".view-playbook-btn").on("click", this._onViewPlaybook.bind(this));

			// Collapsible sections
			html.find(".cell__title, .moves-group-title").on("click", this._onToggleCollapse.bind(this));
		}

		/**
		 * Handle click on labels graph to trigger label shifting
		 * @param {Event} event
		 */
		async _onLabelsGraphClick(event) {
			event.preventDefault();

			// Trigger PbtA's stat shifting dialog
			const statShifting = game.pbta?.sheetConfig?.statShifting;
			if (statShifting) {
				// Use PbtA's built-in stat shifting
				await this.actor.sheet._onStatShifting?.(event)
					?? this._triggerLabelShiftDialog();
			} else {
				this._triggerLabelShiftDialog();
			}
		}

		/**
		 * Fallback label shifting dialog
		 */
		async _triggerLabelShiftDialog() {
			const stats = Object.entries(this.actor.system.stats);
			const content = await renderTemplate("systems/pbta/templates/dialog/stat-shift.hbs", {
				stats: stats.map(([key, stat]) => ({
					key,
					label: stat.label,
					value: stat.value,
					locked: stat.toggle
				}))
			});

			new Dialog({
				title: game.i18n.localize("MASKS-SHEETS.Shift-Labels.label"),
				content,
				buttons: {
					shift: {
						label: game.i18n.localize("MASKS-SHEETS.Shift-Labels.label"),
						callback: async (html) => {
							const up = html.find('select[name="shift-up"]').val();
							const down = html.find('select[name="shift-down"]').val();

							if (up && down && up !== down) {
								const updates = {};
								const upStat = this.actor.system.stats[up];
								const downStat = this.actor.system.stats[down];

								if (!upStat.toggle && upStat.value < 4) {
									updates[`system.stats.${up}.value`] = upStat.value + 1;
								}
								if (!downStat.toggle && downStat.value > -3) {
									updates[`system.stats.${down}.value`] = downStat.value - 1;
								}

								if (Object.keys(updates).length > 0) {
									await this.actor.update(updates);
								}
							}
						}
					},
					cancel: {
						label: game.i18n.localize("Cancel")
					}
				},
				default: "shift"
			}).render(true);
		}

		/**
		 * Toggle label lock status
		 * @param {Event} event
		 */
		async _onToggleLabelLock(event) {
			event.preventDefault();
			const stat = event.currentTarget.dataset.stat;
			const currentValue = this.actor.system.stats[stat]?.toggle ?? false;
			await this.actor.update({ [`system.stats.${stat}.toggle`]: !currentValue });
		}

		/**
		 * Handle label shift button click
		 * @param {Event} event
		 */
		async _onLabelShift(event) {
			event.preventDefault();
			const stat = event.currentTarget.dataset.stat;
			const direction = event.currentTarget.dataset.direction;
			const currentValue = this.actor.system.stats[stat]?.value ?? 0;
			const locked = this.actor.system.stats[stat]?.toggle ?? false;

			if (locked) return;

			let newValue = currentValue;
			if (direction === "up" && currentValue < 4) {
				newValue = currentValue + 1;
			} else if (direction === "down" && currentValue > -3) {
				newValue = currentValue - 1;
			}

			if (newValue !== currentValue) {
				await this.actor.update({ [`system.stats.${stat}.value`]: newValue });
			}
		}

		/**
		 * Handle resource increment/decrement
		 * @param {number} delta - Amount to change
		 * @param {Event} event
		 */
		async _onResourceChange(delta, event) {
			event.preventDefault();
			const attr = event.currentTarget.dataset.attr;
			const path = `system.${attr}`;
			const currentValue = foundry.utils.getProperty(this.actor, path) ?? 0;
			await this.actor.update({ [path]: currentValue + delta });
		}

		/**
		 * Handle condition tag toggle
		 * @param {Event} event
		 */
		async _onConditionToggle(event) {
			event.preventDefault();
			const checkbox = event.currentTarget.querySelector('input[type="checkbox"]');
			if (checkbox) {
				checkbox.checked = !checkbox.checked;
				checkbox.dispatchEvent(new Event('change', { bubbles: true }));
			}
		}

		/**
		 * Handle view playbook button click
		 * @param {Event} event
		 */
		async _onViewPlaybook(event) {
			event.preventDefault();
			const uuid = event.currentTarget.dataset.playbook;
			if (!uuid) return;

			const item = await fromUuid(uuid);
			if (item) {
				item.sheet.render(true);
			}
		}

		/**
		 * Toggle collapse on sections
		 * @param {Event} event
		 */
		_onToggleCollapse(event) {
			const parent = event.currentTarget.closest(".cell--moves");
			if (parent) {
				parent.classList.toggle("collapsed");
			}
		}
	}
}

// Register Handlebars helpers
Hooks.once("init", () => {
	// Helper to extract condition name (removes penalty text)
	Handlebars.registerHelper("conditionName", function(label) {
		return extractConditionName(label);
	});

	// Helper to get label from moveTypes
	Handlebars.registerHelper("getLabel", function(moveTypes, key) {
		return moveTypes?.[key]?.label ?? key;
	});

	// Helper for times loop
	Handlebars.registerHelper("times", function(n, options) {
		let result = "";
		for (let i = 0; i < n; i++) {
			result += options.fn({ ...this, "@index": i });
		}
		return result;
	});
});
