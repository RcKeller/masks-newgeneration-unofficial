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
 * Value range constants
 * Labels can range from -3 to +4 (8 distinct values, 7 steps between them)
 */
const MIN_VALUE = -3;
const MAX_VALUE = 4;
const VALUE_RANGE = MAX_VALUE - MIN_VALUE; // 7

/**
 * Display names for labels (capitalized)
 */
const LABEL_DISPLAY_NAMES = Object.freeze({
	danger: "DAN",
	freak: "FRE",
	savior: "SAV",
	mundane: "MUN",
	superior: "SUP",
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

	// Bonus active (Forward + Ongoing >= 1)
	fillBonus: "rgba(60, 180, 80, 0.6)",        // Green
	strokeBonus: "rgba(80, 220, 100, 0.95)",    // Brighter green edges

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
 * Convert a label value to a normalized radius fraction (0 to 1)
 * -3 maps to 0 (center), +4 maps to 1 (outer edge)
 * @param {number} value - The label value (-3 to +4)
 * @returns {number} Normalized fraction (0 to 1)
 */
function valueToRadiusFraction(value) {
	const clamped = Math.max(MIN_VALUE, Math.min(MAX_VALUE, value));
	return (clamped - MIN_VALUE) / VALUE_RANGE;
}

/**
 * Get the integer values for inner grid lines
 * Returns all integer values between min and max (exclusive)
 */
function getInnerGridValues(): number[] {
	const values: number[] = [];
	for (let v = MIN_VALUE + 1; v < MAX_VALUE; v++) {
		values.push(v); // [-2, -1, 0, 1, 2, 3]
	}
	return values;
}

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
 *   (clamped to MIN_VALUE..MAX_VALUE, currently -3 to +4)
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
	// Clamped to roll modifier range: MIN_VALUE to MAX_VALUE
	const totalPenalty = affectedLabels.size * 2;
	const labels = {};
	for (const key of LABEL_ORDER) {
		const base = Number(stats[key]?.value) || 0;
		const penalty = affectedLabels.has(key) ? 2 : 0;
		labels[key] = Math.max(MIN_VALUE, Math.min(MAX_VALUE, base - penalty + globalBonus));
	}

	return {
		labels,
		affectedLabels,
		globalBonus,
		totalPenalty,
		// Color: green if bonus >= 1, red if penalties > bonus, yellow otherwise
		isPositive: globalBonus >= 1,
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
 * @param {boolean} [options.showVertexDots=false] - Show dots at data polygon vertices
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
		showVertexDots = false,
	} = options;

	// When showing icons, we need extra padding around the pentagon
	// Keep pentagon at full size, just add space for icons
	const iconPadding = showIcons ? size * 0.15 : 0;
	const totalSize = size + (iconPadding * 2);

	const cx = totalSize / 2;
	const cy = totalSize / 2;
	// Pentagon stays at full size (not reduced)
	const outerRadius = (size / 2) - 2;

	// Pentagon vertices (outer edge = +4)
	const outerVerts = getPentagonVertices(cx, cy, outerRadius);

	// Data polygon vertices - use consistent valueToRadiusFraction for all values
	const dataVerts = LABEL_ORDER.map((key, i) => {
		const fraction = valueToRadiusFraction(labels[key] ?? 0);
		const r = outerRadius * fraction;
		const angle = ((i * 72) - 90) * (Math.PI / 180);
		return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
	});

	// Color: green if positive (bonus >= 1), red if negative (penalties > bonus), yellow default
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

	// Inner grid lines at each integer value, and spokes from center to vertices
	if (showInnerLines) {
		// Draw inner pentagon rings at each integer value from -2 to +3
		for (const value of getInnerGridValues()) {
			const fraction = valueToRadiusFraction(value);
			const verts = getPentagonVertices(cx, cy, outerRadius * fraction);
			parts.push(`<path d="${polygonPath(verts)}" fill="none" stroke="${COLORS.gridLines}" stroke-width="0.5" />`);
		}
		// Draw spokes from center to each vertex
		for (const v of outerVerts) {
			parts.push(`<path d="M ${cx} ${cy} L ${v.x} ${v.y}" stroke="${COLORS.gridLines}" stroke-width="0.5" />`);
		}
	}

	// Data polygon - with class for programmatic animation
	parts.push(`<path class="labels-graph-data" d="${polygonPath(dataVerts)}" fill="${fill}" stroke="${stroke}" stroke-width="${Math.max(1, borderWidth - 0.5)}" />`);

	// Vertex dots at data polygon points
	if (showVertexDots) {
		const dotRadius = size * 0.02;
		for (const v of dataVerts) {
			parts.push(
				`<circle cx="${v.x}" cy="${v.y}" r="${dotRadius}" fill="rgba(255, 255, 255, 1)" class="vertex-dot" />`
			);
		}
	}

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
 * Calculate the data path and colors for given label values
 * Used for both initial render and animated updates
 * @param {Object} options - Configuration options
 * @returns {Object} Object with path, fill, and stroke
 */
export function calculateLabelsGraphPath(options) {
	const {
		labels = {},
		isPositive = false,
		isNegative = false,
		size = 28,
		showIcons = false,
	} = options;

	const iconPadding = showIcons ? size * 0.15 : 0;
	const totalSize = size + (iconPadding * 2);
	const cx = totalSize / 2;
	const cy = totalSize / 2;
	const outerRadius = (size / 2) - 2;

	// Use consistent valueToRadiusFraction for all values
	const dataVerts = LABEL_ORDER.map((key, i) => {
		const fraction = valueToRadiusFraction(labels[key] ?? 0);
		const r = outerRadius * fraction;
		const angle = ((i * 72) - 90) * (Math.PI / 180);
		return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
	});

	const [fill, stroke] = isPositive
		? [COLORS.fillBonus, COLORS.strokeBonus]
		: isNegative
		? [COLORS.fillCondition, COLORS.strokeCondition]
		: [COLORS.fillDefault, COLORS.strokeDefault];

	return {
		path: polygonPath(dataVerts),
		fill,
		stroke,
	};
}

/**
 * Update an existing labels graph SVG in-place for smooth animation
 * Uses attribute-based animation with CSS transitions for reliable SVG animation
 * @param {HTMLElement} container - Container element holding the SVG
 * @param {Actor} actor - The actor to get data from
 * @param {Object} [options] - SVG options (size, showIcons)
 * @returns {boolean} True if update was performed, false if full re-render needed
 */
export function updateLabelsGraphAnimated(container, actor, options = {}) {
	if (!container || !actor) return false;

	const svg = container.querySelector(".labels-graph-svg");
	const dataPath = svg?.querySelector(".labels-graph-data") as SVGPathElement | null;

	// If SVG structure doesn't exist, need full re-render
	if (!svg || !dataPath) return false;

	const data = extractLabelsData(actor);
	if (!data) return false;

	// Capture current state before calculating new
	const prevPath = dataPath.getAttribute("d") ?? "";
	const prevFill = dataPath.getAttribute("fill") ?? "";
	const prevStroke = dataPath.getAttribute("stroke") ?? "";

	const { path, fill, stroke } = calculateLabelsGraphPath({
		labels: data.labels,
		isPositive: data.isPositive,
		isNegative: data.isNegative,
		size: options.size ?? 28,
		showIcons: options.showIcons ?? false,
	});

	// Skip animation if nothing changed
	if (prevPath === path && prevFill === fill && prevStroke === stroke) {
		return true; // Still successful, just no change
	}

	// Animation strategy: set to old values, force reflow, then animate to new values
	// This ensures the browser registers the "from" state before transitioning

	// Step 1: Disable transitions and ensure we're at old values
	dataPath.style.transition = "none";
	// Values are already at prevPath/prevFill/prevStroke, but re-set for safety

	// Step 2: Force reflow
	void dataPath.getBoundingClientRect();

	// Step 3: Enable transitions for fill/stroke and set new values
	dataPath.style.transition = "fill 0.4s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
	dataPath.setAttribute("fill", fill);
	dataPath.setAttribute("stroke", stroke);

	// For path 'd' animation, use Web Animations API
	if (prevPath !== path) {
		try {
			const anim = dataPath.animate(
				[
					{ d: `path("${prevPath}")` },
					{ d: `path("${path}")` }
				],
				{
					duration: 400,
					easing: "cubic-bezier(0.4, 0, 0.2, 1)",
					fill: "forwards"
				}
			);
			anim.onfinish = () => {
				dataPath.setAttribute("d", path);
			};
		} catch {
			// Fallback: just set the path immediately
			dataPath.setAttribute("d", path);
		}
	}

	// Update tooltip if container has data-tooltip
	const tooltip = generateLabelsTooltip(data.labels, data.affectedLabels);
	if (container.hasAttribute("data-tooltip")) {
		container.setAttribute("data-tooltip", tooltip);
	}

	return true;
}

/** SVG generation options */
interface LabelsGraphSVGOptions {
	size?: number;
	borderWidth?: number;
	showInnerLines?: boolean;
	showIcons?: boolean;
	showVertexDots?: boolean;
}

/**
 * Create labels graph data for template rendering
 * @param {Actor} actor - The Foundry actor
 * @param {Object} [svgOptions] - Optional SVG generation options
 * @returns {Object|null} Data object for template or null if invalid
 */
export function createLabelsGraphData(actor, svgOptions: LabelsGraphSVGOptions = {}) {
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
		showVertexDots: svgOptions.showVertexDots ?? false,
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
	container;
	size;
	borderWidth;
	showInnerLines;
	showVertexDots;
	_data;

	constructor(options: LabelsGraphSVGOptions & { container?: HTMLElement; actor?: Actor } = {}) {
		this.container = options.container;
		this.size = options.size ?? 28;
		this.borderWidth = options.borderWidth ?? 1.5;
		this.showInnerLines = options.showInnerLines ?? true;
		this.showVertexDots = options.showVertexDots ?? false;
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
			showVertexDots: this.showVertexDots,
		});
	}

	getTooltip() {
		if (!this._data) return "";
		return generateLabelsTooltip(this._data.labels, this._data.affectedLabels);
	}

	static fromActor(actor, options: LabelsGraphSVGOptions = {}) {
		const data = extractLabelsData(actor);
		if (!data) return "";
		return generateLabelsGraphSVG({
			labels: data.labels,
			isPositive: data.isPositive,
			isNegative: data.isNegative,
			size: options.size ?? 28,
			borderWidth: options.borderWidth ?? 1.5,
			showInnerLines: options.showInnerLines ?? true,
			showVertexDots: options.showVertexDots ?? false,
		});
	}
}

/**
 * Graph Presets - predefined configurations for different contexts
 * These ensure consistent rendering across turn cards, character sheets, and call sheets
 */
export const GRAPH_PRESETS = Object.freeze({
	turnCard: {
		size: 32,
		borderWidth: 0.5,
		showInnerLines: false,
		showVertexDots: false,
		showIcons: false,
		showSpokeDots: false,
	},
	characterSheet: {
		size: 200,
		borderWidth: 2,
		showInnerLines: true,
		showVertexDots: false,
		showIcons: true,
		showSpokeDots: false,
	},
	callSheet: {
		size: 280,
		borderWidth: 2.5,
		showInnerLines: true,
		showVertexDots: false,
		showIcons: true,
		showSpokeDots: true,
	},
});

// ────────────────────────────────────────────────────────────────────────────
// Shared Animation State Management
// ────────────────────────────────────────────────────────────────────────────

interface GraphAnimationState {
	path: string;
	fill: string;
	stroke: string;
}

// Module-level cache for animation states (keyed by unique identifier)
const graphAnimationStateCache = new Map<string, GraphAnimationState>();

/**
 * Save the current state of a labels graph for later animation
 * Call this BEFORE replacing/re-rendering the graph HTML
 * @param key - Unique identifier (e.g., "actor-{id}", "turncard-{id}")
 * @param container - Container element or SVG element
 */
export function saveGraphAnimationState(key: string, container: HTMLElement | SVGElement | null): void {
	if (!container) return;
	const dataPath = container.querySelector(".labels-graph-data") as SVGPathElement | null;
	if (!dataPath) return;
	graphAnimationStateCache.set(key, {
		path: dataPath.getAttribute("d") ?? "",
		fill: dataPath.getAttribute("fill") ?? "",
		stroke: dataPath.getAttribute("stroke") ?? "",
	});
}

/**
 * Animate a labels graph from its previously saved state to its current state
 * Call this AFTER the new graph HTML is in the DOM
 * Uses attribute-based animation with CSS transitions for reliable SVG path animation
 * @param key - Unique identifier matching the saveGraphAnimationState call
 * @param container - Container element or SVG element with the new graph
 * @returns true if animation was applied, false if skipped
 */
export function animateGraphFromSavedState(key: string, container: HTMLElement | SVGElement | null): boolean {
	const prev = graphAnimationStateCache.get(key);
	graphAnimationStateCache.delete(key); // Always clean up

	if (!prev || !container) return false;

	const dataPath = container.querySelector(".labels-graph-data") as SVGPathElement | null;
	if (!dataPath) return false;

	const newPath = dataPath.getAttribute("d") ?? "";
	const newFill = dataPath.getAttribute("fill") ?? "";
	const newStroke = dataPath.getAttribute("stroke") ?? "";

	// Skip animation if nothing changed
	if (prev.path === newPath && prev.fill === newFill && prev.stroke === newStroke) {
		return false;
	}

	// Animation strategy:
	// 1. Disable transitions and set to OLD values
	// 2. Force reflow to ensure browser registers old state
	// 3. Re-enable transitions and set NEW values
	// This reliably triggers CSS transitions for fill/stroke
	// For the path 'd' attribute, we also try Web Animations API

	// Step 1: Set to old values without transition
	dataPath.style.transition = "none";
	dataPath.setAttribute("d", prev.path);
	dataPath.setAttribute("fill", prev.fill);
	dataPath.setAttribute("stroke", prev.stroke);

	// Step 2: Force reflow
	void dataPath.getBoundingClientRect();

	// Step 3: Re-enable transitions and set new values
	dataPath.style.transition = "fill 0.4s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
	dataPath.setAttribute("fill", newFill);
	dataPath.setAttribute("stroke", newStroke);

	// For path 'd' attribute animation, use Web Animations API (CSS d property)
	// This is supported in modern Chromium (Foundry VTT v13+)
	if (prev.path !== newPath) {
		try {
			const anim = dataPath.animate(
				[
					{ d: `path("${prev.path}")` },
					{ d: `path("${newPath}")` }
				],
				{
					duration: 400,
					easing: "cubic-bezier(0.4, 0, 0.2, 1)",
					fill: "forwards"
				}
			);
			// Ensure attribute is set to final value when animation ends
			anim.onfinish = () => {
				dataPath.setAttribute("d", newPath);
			};
		} catch {
			// Fallback: just set the new path immediately (no shape animation)
			dataPath.setAttribute("d", newPath);
		}
	}

	return true;
}

/**
 * Clear any stale animation states (call on cleanup)
 */
export function clearGraphAnimationState(key: string): void {
	graphAnimationStateCache.delete(key);
}

// Export constants for external use
export { LABEL_ORDER, LABEL_DISPLAY_NAMES, LABEL_ICONS, CONDITION_TO_LABEL, COLORS };

// Export shared utilities for use by labels-graph-overlay.ts
export {
	MIN_VALUE,
	MAX_VALUE,
	VALUE_RANGE,
	valueToRadiusFraction,
	getInnerGridValues,
	getPentagonVertices,
	polygonPath,
};
