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
 * Generate a unique ID for overlay elements (clipPath, mask)
 * Needed to prevent ID collisions when multiple graphs are on the same page
 */
function makeOverlayUid(): string {
	// Prefer Foundry's randomID if available
	const rid = (globalThis as any)?.foundry?.utils?.randomID?.();
	if (rid) return String(rid);

	// Fallback to crypto
	if (globalThis.crypto?.getRandomValues) {
		const bytes = new Uint8Array(8);
		globalThis.crypto.getRandomValues(bytes);
		return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
	}

	// Last resort
	return Math.random().toString(36).slice(2, 10);
}

/**
 * Overlay colors for Call sheet graphs
 *
 * THREE-POLYGON ARCHITECTURE:
 * 1. Hero polygon: ALWAYS yellow (never changes based on fit)
 * 2. Requirements polygon: ALWAYS grey (shown after reveal, GM can preview)
 * 3. Overlap polygon: green/yellow/red based on fit result
 */
export const OVERLAY_COLORS = Object.freeze({
	// Hero polygon - ALWAYS blue (never changes based on fit)
	heroFill: "rgba(90, 140, 200, 0.6)",
	heroStroke: "rgba(100, 170, 240, 0.95)",

	// Requirements polygon - ALWAYS grey (neutral)
	requirementFill: "rgba(150, 150, 150, 0.4)",
	requirementStroke: "rgba(200, 200, 200, 0.9)",

	// Overlap polygon - color depends on fit result
	overlapGreatFill: "rgba(60, 180, 80, 0.6)",       // Green - success (all requirements met)
	overlapGreatStroke: "rgba(80, 220, 100, 0.95)",
	overlapGoodFill: "rgba(245, 158, 11, 0.6)",       // Yellow - partial success (2+ requirements met)
	overlapGoodStroke: "rgba(251, 191, 36, 0.95)",
	overlapPoorFill: "rgba(200, 80, 80, 0.6)",        // Red - failure (<2 requirements met)
	overlapPoorStroke: "rgba(240, 100, 100, 0.95)",

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
 * Check if hero meets requirements and determine fit result
 *
 * Criteria:
 * - "great" (success): Meet ALL requirements
 * - "good" (partial): Meet at least 2 requirements
 * - "poor" (failure): Meet fewer than 2 requirements
 *
 * Undefined/null requirements are not counted (not required for that label)
 */
export function checkFitResult(
	heroLabels: Record<string, number>,
	requirements: CallRequirements
): FitResult {
	let totalRequired = 0;
	let metCount = 0;

	for (const key of LABEL_ORDER) {
		const req = requirements[key as keyof CallRequirements];
		// Undefined/null = not required (skip this label)
		if (req == null) continue;

		totalRequired++;
		const heroValue = heroLabels[key] ?? 0;

		if (heroValue >= req) {
			metCount++;
		}
	}

	// No requirements = auto pass
	if (totalRequired === 0) return "great";

	// Meet ALL requirements = success
	if (metCount === totalRequired) return "great";

	// Meet at least 2 requirements = partial success
	if (metCount >= 2) return "good";

	// Meet fewer than 2 requirements = failure
	return "poor";
}


/**
 * Get overlap polygon colors based on fit result
 * Only used when isAssessed=true (after dispatch)
 */
function getOverlapColors(fit: FitResult): { fill: string; stroke: string } | null {
	switch (fit) {
		case "great":
			return {
				fill: OVERLAY_COLORS.overlapGreatFill,
				stroke: OVERLAY_COLORS.overlapGreatStroke,
			};
		case "good":
			return {
				fill: OVERLAY_COLORS.overlapGoodFill,
				stroke: OVERLAY_COLORS.overlapGoodStroke,
			};
		case "poor":
			return {
				fill: OVERLAY_COLORS.overlapPoorFill,
				stroke: OVERLAY_COLORS.overlapPoorStroke,
			};
		default:
			return null;
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
 * Generate SVG markup for the three-polygon overlay labels graph
 *
 * Layer order (bottom to top):
 * 1. Pentagon background
 * 2. Grid lines (if enabled)
 * 3. Requirements polygon (grey, dashed) - only shown after reveal (or GM preview)
 * 4. Hero polygon (yellow, solid) - always shown if hero assigned
 * 5. Overlap polygon (green/yellow/red) - only shown after dispatch based on fit
 * 6. Spoke dots
 * 7. Label icons
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

	// Generate unique IDs for clip/mask to avoid collisions when multiple graphs exist
	const overlayUid = makeOverlayUid();
	const heroClipId = `labels-graph-hero-clip-${overlayUid}`;
	const heroMaskId = `labels-graph-hero-mask-${overlayUid}`;

	// Pentagon vertices
	const outerVerts = getPentagonVertices(cx, cy, outerRadius);

	// Build SVG
	const parts: string[] = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}" class="labels-graph-overlay-svg" data-overlay-uid="${overlayUid}">`,
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

	// Requirements polygon - ALWAYS grey (shown after reveal or for GM preview)
	const reqData = calculateRequirementVertices(requirements, cx, cy, outerRadius);
	const reqVerts = reqData.vertices;

	// Compute requirement path once for reuse
	const reqPathD =
		reqVerts.length === 2
			? `M ${reqVerts[0].x} ${reqVerts[0].y} L ${reqVerts[1].x} ${reqVerts[1].y}`
			: reqVerts.length >= 3
			? polygonPath(reqVerts)
			: "";

	// Only draw requirements shape if there are defined requirements
	if (reqVerts.length >= 2 && reqPathD) {
		parts.push(
			`<path class="labels-graph-overlay-requirements" d="${reqPathD}" ` +
			`fill="${reqVerts.length >= 3 ? OVERLAY_COLORS.requirementFill : "none"}" ` +
			`stroke="${OVERLAY_COLORS.requirementStroke}" stroke-width="${Math.max(1.5, borderWidth - 0.5)}" stroke-dasharray="4,2" ` +
			`style="transition: d 0.4s cubic-bezier(0.4, 0, 0.2, 1), fill 0.3s ease, stroke 0.3s ease;" />`
		);
	}

	// Hero data polygon (if hero assigned) - ALWAYS yellow
	let heroVerts: { x: number; y: number }[] = [];
	let heroPathD = "";
	if (heroLabels) {
		heroVerts = calculateDataVertices(heroLabels, cx, cy, outerRadius);
		heroPathD = polygonPath(heroVerts);
		parts.push(
			`<path class="labels-graph-overlay-hero" d="${heroPathD}" ` +
			`fill="${OVERLAY_COLORS.heroFill}" stroke="${OVERLAY_COLORS.heroStroke}" stroke-width="${Math.max(1.5, borderWidth - 0.5)}" ` +
			`style="transition: d 0.4s cubic-bezier(0.4, 0, 0.2, 1), fill 0.3s ease, stroke 0.3s ease;" />`
		);
	}

	// Add defs for clip/mask - used by overlap layer for true geometric intersection/difference
	// These reference the hero polygon shape for clipping (good fit) or masking (poor fit)
	parts.push(
		`<defs>` +
			`<clipPath id="${heroClipId}" clipPathUnits="userSpaceOnUse">` +
				`<path class="labels-graph-overlay-clip-hero" d="${heroPathD}" />` +
			`</clipPath>` +
			`<mask id="${heroMaskId}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">` +
				`<rect x="0" y="0" width="${totalSize}" height="${totalSize}" fill="white" />` +
				`<path class="labels-graph-overlay-mask-hero" d="${heroPathD}" fill="black" />` +
			`</mask>` +
		`</defs>`
	);

	// Overlap layer - uses SVG clip/mask for true geometric overlap
	// great: show full requirement area in green (no clip/mask)
	// good: intersection = requirements clipped by hero (yellow/orange)
	// poor: show only the part of requirements NOT overlapped by hero (red)
	if (isAssessed && heroLabels && reqVerts.length >= 2 && reqPathD) {
		const overlapColors = getOverlapColors(fitResult);

		if (overlapColors) {
			let clipMaskAttr = "";
			// great: show full requirement area (no clip/mask)
			// good: intersection = requirements clipped by hero
			if (fitResult === "good") {
				clipMaskAttr = `clip-path="url(#${heroClipId})"`;
			}
			// poor: show only the part of requirements NOT overlapped by hero
			else if (fitResult === "poor") {
				clipMaskAttr = `mask="url(#${heroMaskId})"`;
			}

			parts.push(
				`<path class="labels-graph-overlay-overlap" d="${reqPathD}" ` +
				`fill="${reqVerts.length >= 3 ? overlapColors.fill : "none"}" ` +
				`stroke="${overlapColors.stroke}" stroke-width="${Math.max(1.5, borderWidth - 0.5)}" ` +
				`${clipMaskAttr} ` +
				`style="transition: d 0.4s cubic-bezier(0.4, 0, 0.2, 1), fill 0.3s ease, stroke 0.3s ease;" />`
			);
		}
	}

	// Spoke dots at data points - smaller, just emphasizing tips
	if (showSpokeDots) {
		// Smaller dot radius - just enough to emphasize spoke tips
		const dotRadius = size * 0.010;

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
 * Handles all three polygons: requirements, hero, and overlap
 *
 * @param container - The container element holding the SVG
 * @param heroLabels - Pre-computed hero labels (or null to extract from actor)
 * @param requirements - Call requirements
 * @param options - Rendering options
 * @param actor - Optional actor to extract labels from (used if heroLabels is null)
 * @returns true if partial update succeeded, false if full re-render needed
 */
export function updateOverlayGraphAnimated(
	container: HTMLElement,
	heroLabels: Record<string, number> | null,
	requirements: CallRequirements,
	options: Partial<OverlayGraphOptions> = {},
	actor?: Actor | null
): boolean {
	if (!container) return false;

	const svg = container.querySelector(".labels-graph-overlay-svg");
	const heroPath = svg?.querySelector(".labels-graph-overlay-hero") as SVGPathElement | null;
	const reqPath = svg?.querySelector(".labels-graph-overlay-requirements") as SVGPathElement | null;
	const overlapPath = svg?.querySelector(".labels-graph-overlay-overlap") as SVGPathElement | null;

	// If SVG structure doesn't exist, need full re-render
	if (!svg) return false;

	// Get overlay UID and clip/mask elements for syncing
	const overlayUid = svg.getAttribute("data-overlay-uid") ?? "";
	const clipHeroPath = overlayUid
		? (svg.querySelector(`#labels-graph-hero-clip-${overlayUid} .labels-graph-overlay-clip-hero`) as SVGPathElement | null)
		: null;
	const maskHeroPath = overlayUid
		? (svg.querySelector(`#labels-graph-hero-mask-${overlayUid} .labels-graph-overlay-mask-hero`) as SVGPathElement | null)
		: null;

	// Get current size from SVG viewBox
	const viewBox = svg.getAttribute("viewBox")?.split(" ");
	const totalSize = viewBox ? parseFloat(viewBox[2]) : 120;
	const showIcons = options.showIcons ?? true;
	const iconPadding = showIcons ? (totalSize / (1 + 0.36)) * 0.18 : 0;
	const size = totalSize - (iconPadding * 2);
	const cx = totalSize / 2;
	const cy = totalSize / 2;
	const outerRadius = (size / 2) - 2;

	// Use provided hero labels, or extract from actor if needed
	let labels = heroLabels;
	if (!labels && actor) {
		const data = extractLabelsData(actor);
		if (data) {
			labels = data.labels;
		}
	}

	// Calculate fit
	const fitResult = labels ? checkFitResult(labels, requirements) : null;
	const isAssessed = options.isAssessed ?? false;

	// Update requirements path (always grey)
	const reqData = calculateRequirementVertices(requirements, cx, cy, outerRadius);
	const reqVerts = reqData.vertices;

	// Compute requirement path once for reuse
	const reqPathD =
		reqVerts.length === 2
			? `M ${reqVerts[0].x} ${reqVerts[0].y} L ${reqVerts[1].x} ${reqVerts[1].y}`
			: reqVerts.length >= 3
			? polygonPath(reqVerts)
			: "";

	// Check for structural mismatches that require full re-render
	// 1. Hero exists but hero path element is missing
	if (labels && !heroPath) return false;
	// 2. Requirements >= 2 but requirements path element is missing
	if (reqVerts.length >= 2 && !reqPath) return false;
	// 3. Number of requirement dots changed (structure mismatch)
	const reqDots = svg.querySelectorAll(".spoke-dot-req");
	if (reqDots.length !== reqVerts.length) return false;

	if (reqPath) {
		if (reqVerts.length >= 2 && reqPathD) {
			// Save old values for animation
			const oldReqPath = reqPath.getAttribute("d") ?? "";
			const oldReqFill = reqPath.getAttribute("fill") ?? "";
			const oldReqStroke = reqPath.getAttribute("stroke") ?? "";
			const newReqFill = reqVerts.length >= 3 ? OVERLAY_COLORS.requirementFill : "none";
			const newReqStroke = OVERLAY_COLORS.requirementStroke;

			// Animate if values changed
			if (oldReqPath !== reqPathD || oldReqFill !== newReqFill || oldReqStroke !== newReqStroke) {
				// Use CSS transitions for fill/stroke (reliable)
				reqPath.style.transition = "none";
				void reqPath.getBoundingClientRect(); // Force reflow
				reqPath.style.transition = "fill 0.4s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
				reqPath.setAttribute("fill", newReqFill);
				reqPath.setAttribute("stroke", newReqStroke);

				// For path 'd' animation, use Web Animations API
				if (oldReqPath !== reqPathD) {
					try {
						const anim = reqPath.animate(
							[{ d: `path("${oldReqPath}")` }, { d: `path("${reqPathD}")` }],
							{ duration: 400, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
						);
						anim.onfinish = () => reqPath.setAttribute("d", reqPathD);
					} catch {
						reqPath.setAttribute("d", reqPathD);
					}
				}
			} else {
				// No change needed
				reqPath.setAttribute("d", reqPathD);
				reqPath.setAttribute("fill", newReqFill);
				reqPath.setAttribute("stroke", newReqStroke);
			}
		} else {
			// No requirements - hide the path
			reqPath.setAttribute("d", "");
			reqPath.setAttribute("fill", "none");
			reqPath.setAttribute("stroke", "none");
		}
	}

	// Update hero path (always blue) and sync clip/mask hero shapes
	let heroPathD = "";
	if (heroPath && labels) {
		const heroVerts = calculateDataVertices(labels, cx, cy, outerRadius);
		heroPathD = polygonPath(heroVerts);

		// Save old values for animation
		const oldHeroPath = heroPath.getAttribute("d") ?? "";
		const oldHeroFill = heroPath.getAttribute("fill") ?? "";
		const oldHeroStroke = heroPath.getAttribute("stroke") ?? "";

		const newFill = OVERLAY_COLORS.heroFill;
		const newStroke = OVERLAY_COLORS.heroStroke;

		// Animate if values changed
		if (oldHeroPath !== heroPathD || oldHeroFill !== newFill || oldHeroStroke !== newStroke) {
			// Use CSS transitions for fill/stroke (reliable)
			heroPath.style.transition = "none";
			void heroPath.getBoundingClientRect(); // Force reflow
			heroPath.style.transition = "fill 0.4s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
			heroPath.setAttribute("fill", newFill);
			heroPath.setAttribute("stroke", newStroke);

			// For path 'd' animation, use Web Animations API
			if (oldHeroPath !== heroPathD) {
				try {
					const anim = heroPath.animate(
						[{ d: `path("${oldHeroPath}")` }, { d: `path("${heroPathD}")` }],
						{ duration: 400, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
					);
					anim.onfinish = () => heroPath.setAttribute("d", heroPathD);
				} catch {
					heroPath.setAttribute("d", heroPathD);
				}
			}
		} else {
			heroPath.setAttribute("d", heroPathD);
			heroPath.setAttribute("fill", newFill);
			heroPath.setAttribute("stroke", newStroke);
		}

		// Update hero spoke dots to match new vertex positions (with animation)
		const heroDots = svg.querySelectorAll(".spoke-dot-hero");
		heroVerts.forEach((v: { x: number; y: number }, i: number) => {
			const dot = heroDots[i] as SVGCircleElement | undefined;
			if (dot) {
				const oldCx = dot.getAttribute("cx") ?? String(v.x);
				const oldCy = dot.getAttribute("cy") ?? String(v.y);

				// Animate if position changed
				if (oldCx !== String(v.x) || oldCy !== String(v.y)) {
					try {
						const anim = dot.animate(
							[{ cx: oldCx, cy: oldCy }, { cx: String(v.x), cy: String(v.y) }],
							{ duration: 400, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
						);
						anim.onfinish = () => {
							dot.setAttribute("cx", String(v.x));
							dot.setAttribute("cy", String(v.y));
						};
					} catch {
						dot.setAttribute("cx", String(v.x));
						dot.setAttribute("cy", String(v.y));
					}
				}
			}
		});
	}

	// Keep clip/mask hero shapes synced (needed for correct overlap in good/poor)
	if (clipHeroPath) clipHeroPath.setAttribute("d", heroPathD);
	if (maskHeroPath) maskHeroPath.setAttribute("d", heroPathD);

	// Check if SVG has the required elements for assessed state
	if (isAssessed) {
		// If assessed but the SVG doesn't have the overlap layer/defs (older markup), force re-render
		if (!overlapPath || !overlayUid || !clipHeroPath || !maskHeroPath) return false;
	}

	// Update overlap path (only when assessed)
	if (overlapPath) {
		if (isAssessed && labels && reqVerts.length >= 2 && reqPathD) {
			const overlapColors = getOverlapColors(fitResult);
			if (!overlapColors) return true;

			overlapPath.setAttribute("d", reqPathD);
			overlapPath.setAttribute("fill", reqVerts.length >= 3 ? overlapColors.fill : "none");
			overlapPath.setAttribute("stroke", overlapColors.stroke);

			// Switch behavior by fit:
			if (fitResult === "good") {
				overlapPath.setAttribute("clip-path", `url(#labels-graph-hero-clip-${overlayUid})`);
				overlapPath.removeAttribute("mask");
			} else if (fitResult === "poor") {
				overlapPath.setAttribute("mask", `url(#labels-graph-hero-mask-${overlayUid})`);
				overlapPath.removeAttribute("clip-path");
			} else {
				// great - no clip/mask, show full requirements area
				overlapPath.removeAttribute("clip-path");
				overlapPath.removeAttribute("mask");
			}
		} else {
			// Not assessed or missing inputs -> hide overlap
			overlapPath.setAttribute("d", "");
			overlapPath.setAttribute("fill", "none");
			overlapPath.setAttribute("stroke", "none");
			overlapPath.removeAttribute("clip-path");
			overlapPath.removeAttribute("mask");
		}
	}

	return true;
}
