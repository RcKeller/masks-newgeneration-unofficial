// module/labels-graph.mjs
// Labels Graph - Pentagon-shaped data visualization for Masks labels
// Reusable component that can be used in turn cards, character sheets, etc.
/* global foundry */

/**
 * Configuration for the Labels Graph
 */
const LABEL_ORDER = Object.freeze([
	"danger",   // Top center (0)
	"freak",    // Top right (1)
	"savior",   // Bottom right (2)
	"mundane",  // Bottom left (3)
	"superior", // Top left (4)
]);

/**
 * Display names for labels (capitalized)
 */
const LABEL_DISPLAY_NAMES = Object.freeze({
	danger: "Danger",
	freak: "Freak",
	savior: "Savior",
	mundane: "Mundane",
	superior: "Superior",
});

/**
 * Font Awesome icons for labels (unicode characters for SVG text)
 * These correspond to Font Awesome 6 Solid icons
 */
const LABEL_ICONS = Object.freeze({
	danger: { unicode: "\uf6de", class: "fa-hand-fist", color: "#e05252" },         // hand-fist - red
	freak: { unicode: "\uf6e8", class: "fa-hat-wizard", color: "#9b59b6" },         // hat-wizard - purple
	savior: { unicode: "\uf132", class: "fa-shield-heart", color: "#3498db" },      // shield-heart - blue
	mundane: { unicode: "\uf8c0", class: "fa-hat-cowboy", color: "#27ae60" },       // hat-cowboy - green
	superior: { unicode: "\uf19d", class: "fa-graduation-cap", color: "#f39c12" }, // graduation-cap - gold
});

/**
 * Condition to Label mapping
 * Each condition applies -2 to a specific label
 */
const CONDITION_TO_LABEL = Object.freeze({
	// By condition index (from system.attributes.conditions.options)
	0: "danger",   // Afraid: -2 Danger
	1: "mundane",  // Angry: -2 Mundane
	2: "superior", // Guilty: -2 Superior
	3: "freak",    // Hopeless: -2 Freak
	4: "savior",   // Insecure: -2 Savior
	// By condition name (lowercase)
	afraid: "danger",
	angry: "mundane",
	guilty: "superior",
	hopeless: "freak",
	insecure: "savior",
});

/**
 * Color configuration
 */
const COLORS = Object.freeze({
	// Default (no bonus, no conditions)
	fillDefault: "rgba(180, 160, 90, 0.6)",     // Dull yellow
	strokeDefault: "rgba(220, 200, 100, 0.95)", // Brighter yellow edges

	// Bonus active (Forward + Ongoing > 0)
	fillBonus: "rgba(60, 140, 200, 0.6)",       // Blue
	strokeBonus: "rgba(100, 180, 240, 0.95)",   // Brighter blue edges

	// Condition affecting a stat (red)
	fillCondition: "rgba(180, 60, 60, 0.6)",    // Red
	strokeCondition: "rgba(220, 80, 80, 0.95)", // Brighter red edges

	// Grid/web lines
	gridLines: "rgba(255, 255, 255, 0.25)",
	gridOuter: "rgba(255, 255, 255, 0.5)",

	// Pentagon background
	pentagonBg: "rgba(30, 30, 25, 0.7)",        // Dark background inside pentagon
	pentagonBorder: "rgba(255, 255, 255, 0.85)", // White border around pentagon
});

/**
 * Get the pentagon vertex positions
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} radius - Radius from center to vertex
 * @returns {Array<{x: number, y: number}>} Array of 5 vertex positions
 */
function getPentagonVertices(cx, cy, radius) {
	const vertices = [];
	for (let i = 0; i < 5; i++) {
		// Start from top (-90 degrees) and go clockwise
		// Each vertex is 72 degrees apart (360/5)
		const angle = ((i * 72) - 90) * (Math.PI / 180);
		vertices.push({
			x: cx + radius * Math.cos(angle),
			y: cy + radius * Math.sin(angle),
		});
	}
	return vertices;
}

/**
 * Create SVG path data for a polygon
 * @param {Array<{x: number, y: number}>} points
 * @returns {string} SVG path d attribute
 */
function polygonPath(points) {
	if (!points.length) return "";
	const [first, ...rest] = points;
	return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(" ")} Z`;
}

/**
 * Extract label data from an actor
 * @param {Actor} actor - The Foundry actor
 * @returns {Object} Label data with effective roll values
 *
 * Effective value formula per label:
 *   effective = base - conditionPenalty + globalBonus
 *   (clamped to roll modifier range: -3 to +4)
 *
 * Where:
 *   - base: the label's base value from character sheet
 *   - conditionPenalty: -2 if that label's condition is active, else 0
 *   - globalBonus: Forward + Ongoing (applies to all labels)
 *
 * Masks Label Ranges:
 *   - Normal sheet range: -2 to +3 (via shifts)
 *   - Roll modifier caps: -3 to +4
 *   - Advances can push to +4
 */
export function extractLabelsData(actor) {
	if (!actor) return null;

	const stats = foundry.utils.getProperty(actor, "system.stats") ?? {};
	const conditions = foundry.utils.getProperty(actor, "system.attributes.conditions.options") ?? {};
	const forward = Number(foundry.utils.getProperty(actor, "system.resources.forward.value")) || 0;
	const ongoing = Number(foundry.utils.getProperty(actor, "system.resources.ongoing.value")) || 0;
	const globalBonus = forward + ongoing;

	// Determine which labels are affected by conditions (-2 each)
	const affectedLabels = new Set();
	for (const [idx, opt] of Object.entries(conditions)) {
		if (opt?.value === true) {
			const label = CONDITION_TO_LABEL[idx];
			if (label) affectedLabels.add(label);
		}
	}

	// Calculate effective values: base - conditionPenalty + globalBonus
	// Clamped to roll modifier range: -3 to +4
	const totalPenalty = affectedLabels.size * 2;
	const labels = {};
	for (const key of LABEL_ORDER) {
		const base = Number(stats[key]?.value) || 0;
		const penalty = affectedLabels.has(key) ? 2 : 0;
		labels[key] = Math.max(-3, Math.min(4, base - penalty + globalBonus));
	}

	return {
		labels,
		affectedLabels,
		globalBonus,
		totalPenalty,
		// Color: blue if bonus >= penalties, red if penalties win, yellow if neutral
		isPositive: globalBonus >= totalPenalty && globalBonus > 0,
		isNegative: totalPenalty > globalBonus,
	};
}

/**
 * Generate SVG markup for the labels graph
 * @param {Object} options - Configuration options
 * @param {Object} options.labels - Label values (already includes all modifiers)
 * @param {boolean} [options.isPositive=false] - Blue state: bonus >= penalties
 * @param {boolean} [options.isNegative=false] - Red state: penalties > bonus
 * @param {number} [options.size=28] - Size of the SVG in pixels
 * @param {number} [options.borderWidth=1.5] - Width of the outer pentagon border
 * @param {boolean} [options.showInnerLines=true] - Show inner grid lines and spokes
 * @param {boolean} [options.showIcons=false] - Show label icons at vertices
 * @returns {string} SVG markup string
 */
export function generateLabelsGraphSVG(options) {
	const {
		labels = {},
		isPositive = false,
		isNegative = false,
		size = 28,
		borderWidth = 1.5,
		showInnerLines = true,
		showIcons = false,
	} = options;

	// When showing icons, we need extra padding around the pentagon
	// Keep pentagon at full size, just add space for icons
	const iconPadding = showIcons ? size * 0.15 : 0;
	const totalSize = size + (iconPadding * 2);

	const cx = totalSize / 2;
	const cy = totalSize / 2;
	// Pentagon stays at full size (not reduced)
	const outerRadius = (size / 2) - 2;
	// Roll modifier range: -3 to +4 (7 steps)
	// At -3 (minimum), the spoke should be at dead center
	const minValue = -3, maxValue = 4, range = 7;

	// Normalize value to 0-1 range for radius calculation
	// At minValue (-3), returns 0 (center); at maxValue (+4), returns 1 (outer edge)
	const normalize = (v) => (Math.max(minValue, Math.min(maxValue, v)) - minValue) / range;

	// Pentagon vertices
	const outerVerts = getPentagonVertices(cx, cy, outerRadius);

	// Data polygon vertices
	const dataVerts = LABEL_ORDER.map((key, i) => {
		const norm = normalize(labels[key] ?? 0);
		const r = outerRadius * Math.max(0.08, norm);
		const angle = ((i * 72) - 90) * (Math.PI / 180);
		return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
	});

	// Color: blue if positive, red if negative, yellow default
	const [fill, stroke] = isPositive
		? [COLORS.fillBonus, COLORS.strokeBonus]
		: isNegative
		? [COLORS.fillCondition, COLORS.strokeCondition]
		: [COLORS.fillDefault, COLORS.strokeDefault];

	// Build SVG - use totalSize for viewBox when icons are shown
	const parts = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}" class="labels-graph-svg">`,
		`<path d="${polygonPath(outerVerts)}" fill="${COLORS.pentagonBg}" stroke="${COLORS.pentagonBorder}" stroke-width="${borderWidth}" />`,
	];

	// Inner grid lines and spokes
	if (showInnerLines) {
		for (let level = 1; level < 4; level++) {
			const verts = getPentagonVertices(cx, cy, (outerRadius * level) / 4);
			parts.push(`<path d="${polygonPath(verts)}" fill="none" stroke="${COLORS.gridLines}" stroke-width="0.5" />`);
		}
		for (const v of outerVerts) {
			parts.push(`<path d="M ${cx} ${cy} L ${v.x} ${v.y}" stroke="${COLORS.gridLines}" stroke-width="0.5" />`);
		}
	}

	// Data polygon
	parts.push(`<path d="${polygonPath(dataVerts)}" fill="${fill}" stroke="${stroke}" stroke-width="${Math.max(1, borderWidth - 0.5)}" />`);

	// Label icons at vertices (positioned close to the pentagon vertices)
	if (showIcons) {
		const iconRadius = outerRadius + (size * 0.08); // Position icons just outside vertices
		const fontSize = size * 0.14; // Bigger icons
		LABEL_ORDER.forEach((key, i) => {
			const icon = LABEL_ICONS[key];
			if (!icon) return;
			const angle = ((i * 72) - 90) * (Math.PI / 180);
			const x = cx + iconRadius * Math.cos(angle);
			const y = cy + iconRadius * Math.sin(angle);
			// Use Font Awesome font-family for the icon unicode with label-specific color
			parts.push(
				`<text x="${x}" y="${y}" ` +
				`font-family="'Font Awesome 6 Free', 'Font Awesome 6 Pro', 'FontAwesome'" ` +
				`font-weight="900" font-size="${fontSize}" ` +
				`fill="${icon.color}" ` +
				`text-anchor="middle" dominant-baseline="central" ` +
				`class="label-icon-vertex label-icon-${key}">${icon.unicode}</text>`
			);
		});
	}

	parts.push(`</svg>`);

	return parts.join("");
}

/**
 * Generate a tooltip string summarizing label values
 * @param {Object} labels - Object with label values
 * @param {Set<string>} [affectedLabels] - Set of label keys affected by conditions
 * @returns {string} Tooltip string like "Danger: 2 | Freak: 1 | ..."
 */
export function generateLabelsTooltip(labels, affectedLabels = new Set()) {
	return LABEL_ORDER
		.map((key) => {
			const value = labels[key] ?? 0;
			const displayName = LABEL_DISPLAY_NAMES[key] || key;
			const isAffected = affectedLabels.has(key);
			// Add indicator if affected by condition
			return isAffected ? `${displayName}: ${value}*` : `${displayName}: ${value}`;
		})
		.join(" | ");
}

/**
 * Create labels graph data for template rendering
 * @param {Actor} actor - The Foundry actor
 * @param {Object} [svgOptions] - Optional SVG generation options
 * @returns {Object|null} Data object for template or null if invalid
 */
export function createLabelsGraphData(actor, svgOptions = {}) {
	const data = extractLabelsData(actor);
	if (!data) return null;

	const svg = generateLabelsGraphSVG({
		labels: data.labels,
		isPositive: data.isPositive,
		isNegative: data.isNegative,
		size: svgOptions.size ?? 28,
		borderWidth: svgOptions.borderWidth ?? 1.5,
		showInnerLines: svgOptions.showInnerLines ?? true,
		showIcons: svgOptions.showIcons ?? false,
	});

	const tooltip = generateLabelsTooltip(data.labels, data.affectedLabels);

	return {
		svg,
		tooltip,
		isPositive: data.isPositive,
		isNegative: data.isNegative,
		// For template conditionals (backward compat)
		hasBonus: data.isPositive,
		hasCondition: data.isNegative,
	};
}

/**
 * LabelsGraph class for programmatic usage
 */
export class LabelsGraph {
	constructor(options = {}) {
		this.container = options.container;
		this.size = options.size ?? 28;
		this.borderWidth = options.borderWidth ?? 1.5;
		this.showInnerLines = options.showInnerLines ?? true;
		this._data = null;
		if (options.actor) this.setActor(options.actor);
	}

	setActor(actor) {
		this._data = extractLabelsData(actor);
		this.render();
	}

	render() {
		if (!this.container || !this._data) return;
		this.container.innerHTML = generateLabelsGraphSVG({
			labels: this._data.labels,
			isPositive: this._data.isPositive,
			isNegative: this._data.isNegative,
			size: this.size,
			borderWidth: this.borderWidth,
			showInnerLines: this.showInnerLines,
		});
	}

	getTooltip() {
		if (!this._data) return "";
		return generateLabelsTooltip(this._data.labels, this._data.affectedLabels);
	}

	static fromActor(actor, options = {}) {
		const data = extractLabelsData(actor);
		if (!data) return "";
		return generateLabelsGraphSVG({
			labels: data.labels,
			isPositive: data.isPositive,
			isNegative: data.isNegative,
			size: options.size ?? 28,
			borderWidth: options.borderWidth ?? 1.5,
			showInnerLines: options.showInnerLines ?? true,
		});
	}
}

// Export constants for external use
export { LABEL_ORDER, LABEL_DISPLAY_NAMES, LABEL_ICONS, CONDITION_TO_LABEL, COLORS };
