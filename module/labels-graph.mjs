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
 * @returns {Object} Label data object with effective values (conditions applied)
 */
export function extractLabelsData(actor) {
	if (!actor) return null;

	const stats = foundry.utils.getProperty(actor, "system.stats") ?? {};
	const conditions = foundry.utils.getProperty(actor, "system.attributes.conditions.options") ?? {};
	const forward = Number(foundry.utils.getProperty(actor, "system.resources.forward.value")) || 0;
	const ongoing = Number(foundry.utils.getProperty(actor, "system.resources.ongoing.value")) || 0;

	// Get base label values
	const baseLabels = {};
	for (const key of LABEL_ORDER) {
		baseLabels[key] = Number(stats[key]?.value) || 0;
	}

	// Determine which labels are affected by conditions
	// Conditions give -2 to specific labels:
	// Afraid: -2 Danger, Angry: -2 Mundane, Guilty: -2 Superior,
	// Hopeless: -2 Freak, Insecure: -2 Savior
	const affectedLabels = new Set();
	for (const [idx, opt] of Object.entries(conditions)) {
		if (opt?.value === true) {
			const affectedLabel = CONDITION_TO_LABEL[idx];
			if (affectedLabel) affectedLabels.add(affectedLabel);
		}
	}

	// Calculate effective label values (base - 2 for each active condition)
	// Maximum effective value is 4, minimum can go to -4 (base -2 with condition -2)
	const effectiveLabels = {};
	for (const key of LABEL_ORDER) {
		let value = baseLabels[key];
		if (affectedLabels.has(key)) {
			value -= 2; // Apply condition penalty
		}
		// Clamp to max of 4 (visualization handles min)
		effectiveLabels[key] = Math.min(4, value);
	}

	// Calculate effective bonus
	const effectiveBonus = forward + ongoing;

	return {
		labels: effectiveLabels, // Effective values for visualization
		baseLabels,              // Original values for reference
		affectedLabels,
		effectiveBonus,
		hasBonus: effectiveBonus > 0,
		hasCondition: affectedLabels.size > 0,
	};
}

/**
 * Generate SVG markup for the labels graph
 * @param {Object} options - Configuration options
 * @param {Object} options.labels - Object with label values (danger, freak, savior, mundane, superior)
 * @param {Set<string>} options.affectedLabels - Set of label keys affected by conditions
 * @param {number} [options.effectiveBonus=0] - The effective bonus value (Forward + Ongoing)
 * @param {boolean} [options.hasCondition=false] - Whether the character has any active conditions
 * @param {number} [options.size=28] - Size of the SVG in pixels
 * @param {number} [options.minValue=-4] - Minimum label value (supports -4 with condition penalties)
 * @param {number} [options.maxValue=4] - Maximum label value (effective cap)
 * @param {number} [options.borderWidth=1.5] - Width of the outer pentagon border
 * @param {boolean} [options.showInnerLines=true] - Whether to show inner grid lines and spokes
 * @param {boolean} [options.showVertexDots=false] - Whether to show dots at each data vertex
 * @returns {string} SVG markup string
 */
export function generateLabelsGraphSVG(options) {
	const {
		labels = {},
		affectedLabels = new Set(),
		effectiveBonus = 0,
		hasCondition = false,
		size = 28,
		minValue = -4,
		maxValue = 4,
		borderWidth = 1.5,
		showInnerLines = true,
		showVertexDots = false,
	} = options;

	const cx = size / 2;
	const cy = size / 2;
	const outerRadius = (size / 2) - 2; // Leave margin for stroke
	const gridLevels = 4; // Number of concentric pentagons for the web

	// Normalize values to 0-1 range
	const range = maxValue - minValue;
	const normalizeValue = (v) => {
		const clamped = Math.max(minValue, Math.min(maxValue, v));
		return (clamped - minValue) / range;
	};

	// Generate outer pentagon vertices
	const outerVerts = getPentagonVertices(cx, cy, outerRadius);

	// Generate grid/web lines (only if showInnerLines)
	const gridPaths = [];
	if (showInnerLines) {
		for (let level = 1; level < gridLevels; level++) { // Note: < not <= (outer is drawn separately)
			const r = (outerRadius * level) / gridLevels;
			const verts = getPentagonVertices(cx, cy, r);
			gridPaths.push(polygonPath(verts));
		}
	}

	// Generate spoke lines (from center to each vertex) - only if showInnerLines
	const spokePaths = showInnerLines
		? outerVerts.map((v) => `M ${cx} ${cy} L ${v.x} ${v.y}`)
		: [];

	// Generate data polygon vertices based on label values
	const dataVerts = LABEL_ORDER.map((key, i) => {
		const value = labels[key] ?? 0;
		const norm = normalizeValue(value);
		const r = outerRadius * Math.max(0.08, norm); // Minimum visible radius
		const angle = ((i * 72) - 90) * (Math.PI / 180);
		return {
			x: cx + r * Math.cos(angle),
			y: cy + r * Math.sin(angle),
			key,
			isAffected: affectedLabels.has(key),
		};
	});

	// Determine colors based on conditions and effective bonus
	// Calculate total penalty from conditions (-2 per condition)
	const totalPenalty = affectedLabels.size * 2;

	// Blue: if bonus exceeds total penalties (even with conditions, net positive)
	// Red: if has conditions and bonus doesn't exceed penalties (net negative/neutral)
	// Yellow: default state (no conditions, no bonus)
	let fillColor, strokeColor;
	if (effectiveBonus >= totalPenalty) {
		// Bonus exceeds penalties - show blue
		fillColor = COLORS.fillBonus;
		strokeColor = COLORS.strokeBonus;
	} else if (hasCondition) {
		// Has conditions that aren't fully offset by bonus - show red
		fillColor = COLORS.fillCondition;
		strokeColor = COLORS.strokeCondition;
	} else {
		// Default - no conditions and bonus <= 0
		fillColor = COLORS.fillDefault;
		strokeColor = COLORS.strokeDefault;
	}

	// Build SVG
	const svgParts = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="labels-graph-svg">`,
		// Pentagon background (dark fill with border)
		`<path class="labels-graph-bg" d="${polygonPath(outerVerts)}" fill="${COLORS.pentagonBg}" stroke="${COLORS.pentagonBorder}" stroke-width="${borderWidth}" />`,
	];

	// Inner grid lines (only if showInnerLines)
	if (showInnerLines && gridPaths.length > 0) {
		svgParts.push(
			`<g class="labels-graph-grid" stroke="${COLORS.gridLines}" fill="none" stroke-width="0.5">`,
			...gridPaths.map((d) => `<path d="${d}" />`),
			`</g>`
		);
	}

	// Spokes (only if showInnerLines)
	if (showInnerLines && spokePaths.length > 0) {
		svgParts.push(
			`<g class="labels-graph-spokes" stroke="${COLORS.gridLines}" stroke-width="0.5">`,
			...spokePaths.map((d) => `<path d="${d}" />`),
			`</g>`
		);
	}

	// Data polygon
	svgParts.push(
		`<path class="labels-graph-data" d="${polygonPath(dataVerts)}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${Math.max(1, borderWidth - 0.5)}" />`
	);

	// Data vertices (small dots at each point) - only if showVertexDots
	if (showVertexDots) {
		svgParts.push(
			`<g class="labels-graph-vertices">`,
			...dataVerts.map((v) => {
				const dotColor = v.isAffected ? COLORS.strokeCondition : strokeColor;
				return `<circle cx="${v.x}" cy="${v.y}" r="1.5" fill="${dotColor}" />`;
			}),
			`</g>`
		);
	}

	svgParts.push(`</svg>`);

	return svgParts.join("");
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
 * @param {number} [svgOptions.size=28] - Size of the SVG
 * @param {number} [svgOptions.borderWidth=1.5] - Border width
 * @param {boolean} [svgOptions.showInnerLines=true] - Show inner grid lines
 * @param {boolean} [svgOptions.showVertexDots=false] - Show vertex dots
 * @returns {Object|null} Data object for template or null if invalid
 */
export function createLabelsGraphData(actor, svgOptions = {}) {
	const data = extractLabelsData(actor);
	if (!data) return null;

	const {
		size = 28,
		borderWidth = 1.5,
		showInnerLines = true,
		showVertexDots = false,
	} = svgOptions;

	const svg = generateLabelsGraphSVG({
		labels: data.labels,
		affectedLabels: data.affectedLabels,
		effectiveBonus: data.effectiveBonus,
		hasCondition: data.hasCondition,
		size,
		borderWidth,
		showInnerLines,
		showVertexDots,
	});

	const tooltip = generateLabelsTooltip(data.labels, data.affectedLabels);

	return {
		svg,
		tooltip,
		hasBonus: data.hasBonus,
		hasCondition: data.hasCondition,
		effectiveBonus: data.effectiveBonus,
		labels: data.labels,
		affectedLabels: [...data.affectedLabels],
	};
}

/**
 * LabelsGraph class for programmatic usage
 */
export class LabelsGraph {
	/**
	 * @param {Object} options
	 * @param {HTMLElement} options.container - Container element to render into
	 * @param {Actor} [options.actor] - Foundry actor to display
	 * @param {number} [options.size=28] - Size in pixels
	 * @param {number} [options.borderWidth=1.5] - Border width
	 * @param {boolean} [options.showInnerLines=true] - Show inner grid lines
	 * @param {boolean} [options.showVertexDots=false] - Show vertex dots
	 */
	constructor(options = {}) {
		this.container = options.container;
		this.size = options.size ?? 28;
		this.borderWidth = options.borderWidth ?? 1.5;
		this.showInnerLines = options.showInnerLines ?? true;
		this.showVertexDots = options.showVertexDots ?? false;
		this._actor = null;
		this._data = null;

		if (options.actor) {
			this.setActor(options.actor);
		}
	}

	/**
	 * Set the actor and update the display
	 * @param {Actor} actor
	 */
	setActor(actor) {
		this._actor = actor;
		this._data = extractLabelsData(actor);
		this.render();
	}

	/**
	 * Update with raw data (for non-actor contexts)
	 * @param {Object} data
	 * @param {Object} data.labels - Label values
	 * @param {Array<string>} data.affectedLabels - Affected label keys
	 * @param {boolean} data.hasBonus - Whether there's an effective bonus
	 */
	setData(data) {
		this._data = {
			labels: data.labels ?? {},
			affectedLabels: new Set(data.affectedLabels ?? []),
			hasBonus: !!data.hasBonus,
			hasCondition: (data.affectedLabels?.length ?? 0) > 0,
			effectiveBonus: data.effectiveBonus ?? 0,
		};
		this.render();
	}

	/**
	 * Render the graph to the container
	 */
	render() {
		if (!this.container || !this._data) return;

		const svg = generateLabelsGraphSVG({
			labels: this._data.labels,
			affectedLabels: this._data.affectedLabels,
			effectiveBonus: this._data.effectiveBonus,
			hasCondition: this._data.hasCondition,
			size: this.size,
			borderWidth: this.borderWidth,
			showInnerLines: this.showInnerLines,
			showVertexDots: this.showVertexDots,
		});

		this.container.innerHTML = svg;
	}

	/**
	 * Get current data
	 * @returns {Object|null}
	 */
	getData() {
		return this._data;
	}

	/**
	 * Get tooltip text for current data
	 * @returns {string}
	 */
	getTooltip() {
		if (!this._data) return "";
		return generateLabelsTooltip(this._data.labels, this._data.affectedLabels);
	}

	/**
	 * Static factory method to create graph HTML from actor
	 * @param {Actor} actor
	 * @param {Object} [options] - SVG options
	 * @param {number} [options.size=28] - Size in pixels
	 * @param {number} [options.borderWidth=1.5] - Border width
	 * @param {boolean} [options.showInnerLines=true] - Show inner grid lines
	 * @param {boolean} [options.showVertexDots=false] - Show vertex dots
	 * @returns {string} SVG HTML string
	 */
	static fromActor(actor, options = {}) {
		const data = extractLabelsData(actor);
		if (!data) return "";

		const {
			size = 28,
			borderWidth = 1.5,
			showInnerLines = true,
			showVertexDots = false,
		} = options;

		return generateLabelsGraphSVG({
			labels: data.labels,
			affectedLabels: data.affectedLabels,
			effectiveBonus: data.effectiveBonus,
			hasCondition: data.hasCondition,
			size,
			borderWidth,
			showInnerLines,
			showVertexDots,
		});
	}
}

// Export constants for external use
export { LABEL_ORDER, LABEL_DISPLAY_NAMES, CONDITION_TO_LABEL, COLORS };
