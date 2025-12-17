// module/labels-graph-overlay.ts
// Dual-graph overlay component for Call sheets - shows requirements vs hero stats
// Reuses existing labels-graph.ts infrastructure while adding overlay capabilities

import {
	LABEL_ORDER,
	LABEL_ICONS,
	extractLabelsData,
	// Shared utilities - no duplication
	valueToRadiusFraction,
	getInnerGridValues,
	getPentagonVertices,
	polygonPath,
} from "./labels-graph";

/**
 * Overlay colors for Call sheet graphs
 */
export const OVERLAY_COLORS = Object.freeze({
	// Requirements (neutral)
	requirementFill: "rgba(150, 150, 150, 0.4)",
	requirementStroke: "rgba(200, 200, 200, 0.9)",

	// Hero (yellow default)
	heroFill: "rgba(180, 160, 90, 0.6)",
	heroStroke: "rgba(220, 200, 100, 0.95)",

	// Fit states after dispatch
	greatFitFill: "rgba(60, 180, 80, 0.6)",       // Green - all met
	greatFitStroke: "rgba(80, 220, 100, 0.95)",
	decentFitFill: "rgba(245, 158, 11, 0.6)",     // Orange - some met (was blue)
	decentFitStroke: "rgba(251, 191, 36, 0.95)",
	poorFitFill: "rgba(200, 80, 80, 0.6)",        // Red - none met
	poorFitStroke: "rgba(240, 100, 100, 0.95)",

	// Pending/preview state (orange when partial overlap)
	pendingPartialFill: "rgba(245, 158, 11, 0.6)",
	pendingPartialStroke: "rgba(251, 191, 36, 0.95)",

	// Grid/web lines
	gridLines: "rgba(255, 255, 255, 0.25)",
	gridOuter: "rgba(255, 255, 255, 0.5)",

	// Pentagon background
	pentagonBg: "rgba(30, 30, 25, 0.7)",
	pentagonBorder: "rgba(255, 255, 255, 0.85)",

	// Spoke dots
	spokeDot: "rgba(255, 255, 255, 1)",
});

/**
 * Fit result types from dispatch qualification
 */
export type FitResult = "great" | "good" | "poor" | null;

/**
 * Requirements object - label keys to required values (1-3) or null (not required)
 */
export interface CallRequirements {
	danger?: number | null;
	freak?: number | null;
	savior?: number | null;
	mundane?: number | null;
	superior?: number | null;
}

// getPentagonVertices, polygonPath, valueToRadiusFraction imported from labels-graph.ts

/**
 * Calculate data vertices for a label set
 * Uses valueToRadiusFraction for consistent spatial mapping
 */
function calculateDataVertices(
	labels: Record<string, number>,
	cx: number,
	cy: number,
	outerRadius: number
): { x: number; y: number }[] {
	return LABEL_ORDER.map((key, i) => {
		const value = labels[key] ?? 0;
		const fraction = valueToRadiusFraction(value);
		const r = outerRadius * fraction;
		const angle = ((i * 72) - 90) * (Math.PI / 180);
		return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
	});
}

/**
 * Calculate requirement vertices - only for labels that have requirements (skip undefined)
 * Returns both vertices and which labels are actually required
 * Requirements range: -3 to 4 (undefined/null = not required)
 * Uses valueToRadiusFraction for consistent spatial mapping
 */
function calculateRequirementVertices(
	requirements: CallRequirements,
	cx: number,
	cy: number,
	outerRadius: number
): { vertices: { x: number; y: number; labelKey: string }[]; definedKeys: string[] } {
	const vertices: { x: number; y: number; labelKey: string }[] = [];
	const definedKeys: string[] = [];

	LABEL_ORDER.forEach((key, i) => {
		const req = requirements[key as keyof CallRequirements];
		// Only include labels with actual requirements (not null/undefined)
		// Requirements can now be any value from -3 to 4
		if (req != null) {
			definedKeys.push(key);
			const fraction = valueToRadiusFraction(req);
			const r = outerRadius * fraction;
			const angle = ((i * 72) - 90) * (Math.PI / 180);
			vertices.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), labelKey: key });
		}
	});

	return { vertices, definedKeys };
}

/**
 * Check if hero meets all requirements
 * Undefined requirements are treated as -9 (always met since hero range is -3 to +4)
 */
export function checkFitResult(
	heroLabels: Record<string, number>,
	requirements: CallRequirements
): FitResult {
	let anyRequired = false;
	let allMet = true;
	let anyMet = false;

	for (const key of LABEL_ORDER) {
		const req = requirements[key as keyof CallRequirements];
		// Undefined/null = not required (treated as -9, always met)
		if (req == null) continue;

		anyRequired = true;
		const heroValue = heroLabels[key] ?? 0;

		if (heroValue >= req) {
			anyMet = true;
		} else {
			allMet = false;
		}
	}

	// No requirements = auto pass
	if (!anyRequired) return "great";

	if (allMet) return "great";
	if (anyMet) return "good";
	return "poor";
}

/**
 * Get overlay colors based on fit result
 */
function getOverlayColors(fit: FitResult, isAssessed: boolean) {
	if (!isAssessed) {
		// Preview mode - use hero colors (yellow)
		return {
			heroFill: OVERLAY_COLORS.heroFill,
			heroStroke: OVERLAY_COLORS.heroStroke,
			reqFill: OVERLAY_COLORS.requirementFill,
			reqStroke: OVERLAY_COLORS.requirementStroke,
		};
	}

	// Assessed - color based on fit
	switch (fit) {
		case "great":
			return {
				heroFill: OVERLAY_COLORS.greatFitFill,
				heroStroke: OVERLAY_COLORS.greatFitStroke,
				reqFill: OVERLAY_COLORS.greatFitFill,
				reqStroke: OVERLAY_COLORS.greatFitStroke,
			};
		case "good":
			return {
				heroFill: OVERLAY_COLORS.decentFitFill,
				heroStroke: OVERLAY_COLORS.decentFitStroke,
				reqFill: OVERLAY_COLORS.pendingPartialFill,
				reqStroke: OVERLAY_COLORS.pendingPartialStroke,
			};
		case "poor":
			return {
				heroFill: OVERLAY_COLORS.heroFill,
				heroStroke: OVERLAY_COLORS.heroStroke,
				reqFill: OVERLAY_COLORS.poorFitFill,
				reqStroke: OVERLAY_COLORS.poorFitStroke,
			};
		default:
			return {
				heroFill: OVERLAY_COLORS.heroFill,
				heroStroke: OVERLAY_COLORS.heroStroke,
				reqFill: OVERLAY_COLORS.requirementFill,
				reqStroke: OVERLAY_COLORS.requirementStroke,
			};
	}
}

/**
 * Options for generating the overlay graph
 */
export interface OverlayGraphOptions {
	/** Hero's effective label values (already includes modifiers) */
	heroLabels?: Record<string, number> | null;
	/** Call requirements (1-3 per label, null = not required) */
	requirements: CallRequirements;
	/** Size of the SVG in pixels */
	size?: number;
	/** Width of the outer pentagon border */
	borderWidth?: number;
	/** Show inner grid lines and spokes */
	showInnerLines?: boolean;
	/** Show label icons at vertices */
	showIcons?: boolean;
	/** Show spoke dots (larger, white) */
	showSpokeDots?: boolean;
	/** Fit result (null = not assessed yet) */
	fitResult?: FitResult;
	/** Whether the call has been assessed/dispatched */
	isAssessed?: boolean;
}

/**
 * Generate SVG markup for the dual-overlay labels graph
 * Shows requirements polygon overlaid on hero's stats polygon
 */
export function generateOverlayGraphSVG(options: OverlayGraphOptions): string {
	const {
		heroLabels = null,
		requirements,
		size = 120,
		borderWidth = 2,
		showInnerLines = true,
		showIcons = true,
		showSpokeDots = true,
		fitResult = null,
		isAssessed = false,
	} = options;

	const iconPadding = showIcons ? size * 0.18 : 0;
	const totalSize = size + (iconPadding * 2);
	const cx = totalSize / 2;
	const cy = totalSize / 2;
	const outerRadius = (size / 2) - 2;

	// Pentagon vertices
	const outerVerts = getPentagonVertices(cx, cy, outerRadius);

	// Get colors based on fit state
	const colors = getOverlayColors(fitResult, isAssessed);

	// Build SVG
	const parts: string[] = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}" class="labels-graph-overlay-svg">`,
		// Pentagon background
		`<path d="${polygonPath(outerVerts)}" fill="${OVERLAY_COLORS.pentagonBg}" stroke="${OVERLAY_COLORS.pentagonBorder}" stroke-width="${borderWidth}" />`,
	];

	// Inner grid lines at each integer value, and spokes from center to vertices
	if (showInnerLines) {
		// Draw inner pentagon rings at each integer value from -2 to +3
		for (const value of getInnerGridValues()) {
			const fraction = valueToRadiusFraction(value);
			const verts = getPentagonVertices(cx, cy, outerRadius * fraction);
			parts.push(`<path d="${polygonPath(verts)}" fill="none" stroke="${OVERLAY_COLORS.gridLines}" stroke-width="0.5" />`);
		}
		// Draw spokes from center to each vertex
		for (const v of outerVerts) {
			parts.push(`<path d="M ${cx} ${cy} L ${v.x} ${v.y}" stroke="${OVERLAY_COLORS.gridLines}" stroke-width="0.5" />`);
		}
	}

	// Hero data polygon (if hero assigned)
	let heroVerts: { x: number; y: number }[] = [];
	if (heroLabels) {
		heroVerts = calculateDataVertices(heroLabels, cx, cy, outerRadius);
		parts.push(
			`<path class="labels-graph-overlay-hero" d="${polygonPath(heroVerts)}" ` +
			`fill="${colors.heroFill}" stroke="${colors.heroStroke}" stroke-width="${Math.max(1.5, borderWidth - 0.5)}" ` +
			`style="transition: d 0.4s cubic-bezier(0.4, 0, 0.2, 1), fill 0.3s ease, stroke 0.3s ease;" />`
		);
	}

	// Requirements polygon - only if there are actual requirements
	const reqData = calculateRequirementVertices(requirements, cx, cy, outerRadius);
	const reqVerts = reqData.vertices;

	// Only draw requirements shape if there are defined requirements
	if (reqVerts.length > 0) {
		// For 1 point: just a dot (handled by spoke dots below)
		// For 2 points: a line
		// For 3+ points: a polygon
		if (reqVerts.length >= 2) {
			const reqPath = reqVerts.length === 2
				? `M ${reqVerts[0].x} ${reqVerts[0].y} L ${reqVerts[1].x} ${reqVerts[1].y}`
				: polygonPath(reqVerts);
			parts.push(
				`<path class="labels-graph-overlay-requirements" d="${reqPath}" ` +
				`fill="${reqVerts.length >= 3 ? colors.reqFill : "none"}" ` +
				`stroke="${colors.reqStroke}" stroke-width="${Math.max(1.5, borderWidth - 0.5)}" stroke-dasharray="4,2" ` +
				`style="transition: d 0.4s cubic-bezier(0.4, 0, 0.2, 1), fill 0.3s ease, stroke 0.3s ease;" />`
			);
		}
	}

	// Spoke dots at data points - smaller, just emphasizing tips
	if (showSpokeDots) {
		// Smaller dot radius - just enough to emphasize spoke tips
		const dotRadius = size * 0.018;

		// Requirements dots - only for labels with actual requirements
		for (const v of reqVerts) {
			parts.push(
				`<circle cx="${v.x}" cy="${v.y}" r="${dotRadius}" fill="${OVERLAY_COLORS.spokeDot}" class="spoke-dot spoke-dot-req" />`
			);
		}

		// Hero dots (if assigned) - all 5 labels
		if (heroLabels && heroVerts.length) {
			for (const v of heroVerts) {
				parts.push(
					`<circle cx="${v.x}" cy="${v.y}" r="${dotRadius * 1.1}" fill="${OVERLAY_COLORS.spokeDot}" class="spoke-dot spoke-dot-hero" />`
				);
			}
		}
	}

	// Label icons at vertices
	if (showIcons) {
		const iconRadius = outerRadius + (size * 0.1);
		const fontSize = size * 0.12;
		LABEL_ORDER.forEach((key, i) => {
			const icon = LABEL_ICONS[key];
			if (!icon) return;
			const angle = ((i * 72) - 90) * (Math.PI / 180);
			const x = cx + iconRadius * Math.cos(angle);
			const y = cy + iconRadius * Math.sin(angle);
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
 * Create overlay graph data for template rendering
 * Extracts hero labels from actor and generates SVG
 * @param actor - The hero actor (or null if no hero assigned)
 * @param requirements - Call requirements
 * @param svgOptions - SVG rendering options
 * @param snapshotLabels - Optional pre-computed labels to use instead of extracting from actor
 *                         (used when displaying qualified calls to show stats at dispatch time)
 */
export function createOverlayGraphData(
	actor: Actor | null,
	requirements: CallRequirements,
	svgOptions: Partial<OverlayGraphOptions> = {},
	snapshotLabels?: Record<string, number> | null
): {
	svg: string;
	tooltip: string;
	fitResult: FitResult;
	heroLabels: Record<string, number> | null;
} {
	let heroLabels: Record<string, number> | null = null;
	let fitResult: FitResult = null;

	// Use snapshot labels if provided, otherwise extract from actor
	if (snapshotLabels) {
		heroLabels = snapshotLabels;
	} else if (actor) {
		const data = extractLabelsData(actor);
		if (data) {
			heroLabels = data.labels;
		}
	}

	// Calculate fit if hero assigned
	if (heroLabels) {
		fitResult = checkFitResult(heroLabels, requirements);
	}

	const svg = generateOverlayGraphSVG({
		heroLabels,
		requirements,
		fitResult,
		isAssessed: svgOptions.isAssessed ?? false,
		size: svgOptions.size ?? 120,
		borderWidth: svgOptions.borderWidth ?? 2,
		showInnerLines: svgOptions.showInnerLines ?? true,
		showIcons: svgOptions.showIcons ?? true,
		showSpokeDots: svgOptions.showSpokeDots ?? true,
	});

	// Build tooltip
	const tooltipParts: string[] = [];
	for (const key of LABEL_ORDER) {
		const req = requirements[key as keyof CallRequirements];
		const hero = heroLabels?.[key] ?? 0;
		const reqStr = req != null ? String(req) : "-";
		const met = req == null || hero >= req;
		tooltipParts.push(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${hero}`);
	}
	const tooltip = tooltipParts.join(" | ");

	return {
		svg,
		tooltip,
		fitResult,
		heroLabels,
	};
}

/**
 * Update an existing overlay graph SVG in-place for smooth animation
 */
export function updateOverlayGraphAnimated(
	container: HTMLElement,
	actor: Actor | null,
	requirements: CallRequirements,
	options: Partial<OverlayGraphOptions> = {}
): boolean {
	if (!container) return false;

	const svg = container.querySelector(".labels-graph-overlay-svg");
	const heroPath = svg?.querySelector(".labels-graph-overlay-hero") as SVGPathElement | null;
	const reqPath = svg?.querySelector(".labels-graph-overlay-requirements") as SVGPathElement | null;

	// If SVG structure doesn't exist, need full re-render
	if (!svg || !reqPath) return false;

	// Get current size from SVG viewBox
	const viewBox = svg.getAttribute("viewBox")?.split(" ");
	const totalSize = viewBox ? parseFloat(viewBox[2]) : 120;
	const showIcons = options.showIcons ?? true;
	const iconPadding = showIcons ? (totalSize / (1 + 0.36)) * 0.18 : 0;
	const size = totalSize - (iconPadding * 2);
	const cx = totalSize / 2;
	const cy = totalSize / 2;
	const outerRadius = (size / 2) - 2;

	// Extract hero labels
	let heroLabels: Record<string, number> | null = null;
	if (actor) {
		const data = extractLabelsData(actor);
		if (data) {
			heroLabels = data.labels;
		}
	}

	// Calculate fit
	const fitResult = heroLabels ? checkFitResult(heroLabels, requirements) : null;
	const colors = getOverlayColors(fitResult, options.isAssessed ?? false);

	// Update requirements path
	const reqData = calculateRequirementVertices(requirements, cx, cy, outerRadius);
	const reqVerts = reqData.vertices;

	if (reqVerts.length >= 2) {
		const reqPathD = reqVerts.length === 2
			? `M ${reqVerts[0].x} ${reqVerts[0].y} L ${reqVerts[1].x} ${reqVerts[1].y}`
			: polygonPath(reqVerts);
		reqPath.setAttribute("d", reqPathD);
		reqPath.setAttribute("fill", reqVerts.length >= 3 ? colors.reqFill : "none");
		reqPath.setAttribute("stroke", colors.reqStroke);
	} else if (reqVerts.length === 0) {
		// No requirements - hide the path
		reqPath.setAttribute("d", "");
		reqPath.setAttribute("fill", "none");
		reqPath.setAttribute("stroke", "none");
	}

	// Update hero path (if exists)
	if (heroPath && heroLabels) {
		const heroVerts = calculateDataVertices(heroLabels, cx, cy, outerRadius);
		heroPath.setAttribute("d", polygonPath(heroVerts));
		heroPath.setAttribute("fill", colors.heroFill);
		heroPath.setAttribute("stroke", colors.heroStroke);
	}

	return true;
}
