/**
 * Tests for labels-graph.ts
 * Pure math and SVG generation functions
 */

import {
	createCharacterWithLabels,
	createCharacterWithConditions,
	createCharacterWithBonuses,
} from "../fixtures/actors";

// Import the module under test - need to mock foundry first
const mockFoundry = (globalThis as unknown as Record<string, unknown>).foundry;

// Direct import of pure functions to test
// Note: We need to re-export or test through the public API
// For now, we'll test the exported utilities

describe("labels-graph pure functions", () => {
	describe("valueToRadiusFraction", () => {
		// Import the actual module after mocks are set up
		let valueToRadiusFraction: (value: number) => number;
		let MIN_VALUE: number;
		let MAX_VALUE: number;

		beforeAll(async () => {
			// Dynamic import after mocks
			const module = await import("../../src/module/labels-graph");
			valueToRadiusFraction = module.valueToRadiusFraction;
			MIN_VALUE = module.MIN_VALUE;
			MAX_VALUE = module.MAX_VALUE;
		});

		it("should map -3 to 0 (center)", () => {
			expect(valueToRadiusFraction(-3)).toBe(0);
		});

		it("should map +4 to 1 (outer edge)", () => {
			expect(valueToRadiusFraction(4)).toBe(1);
		});

		it("should map 0 to approximately 0.43 (middle-ish)", () => {
			// 0 is 3 steps from -3, out of 7 total steps
			// (0 - (-3)) / 7 = 3/7 ≈ 0.4286
			expect(valueToRadiusFraction(0)).toBeCloseTo(3 / 7, 4);
		});

		it("should map intermediate values correctly", () => {
			// -2 is 1 step from -3: 1/7
			expect(valueToRadiusFraction(-2)).toBeCloseTo(1 / 7, 4);
			// 3 is 6 steps from -3: 6/7
			expect(valueToRadiusFraction(3)).toBeCloseTo(6 / 7, 4);
		});

		it("should clamp values below minimum to 0", () => {
			expect(valueToRadiusFraction(-5)).toBe(0);
			expect(valueToRadiusFraction(-10)).toBe(0);
		});

		it("should clamp values above maximum to 1", () => {
			expect(valueToRadiusFraction(5)).toBe(1);
			expect(valueToRadiusFraction(10)).toBe(1);
		});
	});

	describe("getPentagonVertices", () => {
		let getPentagonVertices: (cx: number, cy: number, radius: number) => Array<{ x: number; y: number }>;

		beforeAll(async () => {
			const module = await import("../../src/module/labels-graph");
			getPentagonVertices = module.getPentagonVertices;
		});

		it("should return 5 vertices", () => {
			const vertices = getPentagonVertices(50, 50, 40);
			expect(vertices).toHaveLength(5);
		});

		it("should place first vertex at top center", () => {
			const vertices = getPentagonVertices(50, 50, 40);
			// First vertex at -90 degrees (straight up)
			expect(vertices[0].x).toBeCloseTo(50, 4); // cx
			expect(vertices[0].y).toBeCloseTo(10, 4); // cy - radius
		});

		it("should place vertices at equal angular distances (72 degrees)", () => {
			const vertices = getPentagonVertices(100, 100, 50);
			// Calculate distances from center - should all be equal to radius
			for (const v of vertices) {
				const dist = Math.sqrt((v.x - 100) ** 2 + (v.y - 100) ** 2);
				expect(dist).toBeCloseTo(50, 4);
			}
		});

		it("should handle zero radius (all vertices at center)", () => {
			const vertices = getPentagonVertices(25, 25, 0);
			for (const v of vertices) {
				expect(v.x).toBeCloseTo(25, 4);
				expect(v.y).toBeCloseTo(25, 4);
			}
		});
	});

	describe("getInnerGridValues", () => {
		let getInnerGridValues: () => number[];
		let MIN_VALUE: number;
		let MAX_VALUE: number;

		beforeAll(async () => {
			const module = await import("../../src/module/labels-graph");
			getInnerGridValues = module.getInnerGridValues;
			MIN_VALUE = module.MIN_VALUE;
			MAX_VALUE = module.MAX_VALUE;
		});

		it("should return values between min and max exclusive", () => {
			const values = getInnerGridValues();
			expect(values).not.toContain(-3); // MIN_VALUE
			expect(values).not.toContain(4); // MAX_VALUE
		});

		it("should return exactly 6 inner values [-2, -1, 0, 1, 2, 3]", () => {
			const values = getInnerGridValues();
			expect(values).toEqual([-2, -1, 0, 1, 2, 3]);
		});
	});

	describe("polygonPath", () => {
		let polygonPath: (points: Array<{ x: number; y: number }>) => string;

		beforeAll(async () => {
			const module = await import("../../src/module/labels-graph");
			polygonPath = module.polygonPath;
		});

		it("should return empty string for empty array", () => {
			expect(polygonPath([])).toBe("");
		});

		it("should create valid SVG path for triangle", () => {
			const points = [
				{ x: 0, y: 0 },
				{ x: 10, y: 0 },
				{ x: 5, y: 10 },
			];
			const path = polygonPath(points);
			expect(path).toBe("M 0 0 L 10 0 L 5 10 Z");
		});

		it("should create valid SVG path for pentagon", () => {
			const points = [
				{ x: 50, y: 0 },
				{ x: 100, y: 35 },
				{ x: 80, y: 90 },
				{ x: 20, y: 90 },
				{ x: 0, y: 35 },
			];
			const path = polygonPath(points);
			expect(path).toMatch(/^M 50 0/);
			expect(path).toMatch(/Z$/);
			expect(path.split("L")).toHaveLength(5); // M + 4 L commands
		});
	});

	describe("LABEL_ORDER constant", () => {
		let LABEL_ORDER: readonly string[];

		beforeAll(async () => {
			const module = await import("../../src/module/labels-graph");
			LABEL_ORDER = module.LABEL_ORDER;
		});

		it("should contain exactly 5 labels in correct order", () => {
			expect(LABEL_ORDER).toEqual(["danger", "freak", "savior", "mundane", "superior"]);
		});

		it("should be frozen (immutable)", () => {
			expect(Object.isFrozen(LABEL_ORDER)).toBe(true);
		});
	});

	describe("CONDITION_TO_LABEL mapping", () => {
		let CONDITION_TO_LABEL: Record<string | number, string>;

		beforeAll(async () => {
			const module = await import("../../src/module/labels-graph");
			CONDITION_TO_LABEL = module.CONDITION_TO_LABEL;
		});

		it("should map condition indices correctly", () => {
			expect(CONDITION_TO_LABEL[0]).toBe("danger"); // Afraid
			expect(CONDITION_TO_LABEL[1]).toBe("mundane"); // Angry
			expect(CONDITION_TO_LABEL[2]).toBe("superior"); // Guilty
			expect(CONDITION_TO_LABEL[3]).toBe("freak"); // Hopeless
			expect(CONDITION_TO_LABEL[4]).toBe("savior"); // Insecure
		});

		it("should map condition names correctly", () => {
			expect(CONDITION_TO_LABEL["afraid"]).toBe("danger");
			expect(CONDITION_TO_LABEL["angry"]).toBe("mundane");
			expect(CONDITION_TO_LABEL["guilty"]).toBe("superior");
			expect(CONDITION_TO_LABEL["hopeless"]).toBe("freak");
			expect(CONDITION_TO_LABEL["insecure"]).toBe("savior");
		});
	});
});

describe("labels-graph data extraction", () => {
	describe("extractLabelsData", () => {
		let extractLabelsData: (actor: unknown) => {
			labels: Record<string, number>;
			affectedLabels: Set<string>;
			globalBonus: number;
			totalPenalty: number;
			isPositive: boolean;
			isNegative: boolean;
		} | null;

		beforeAll(async () => {
			const module = await import("../../src/module/labels-graph");
			extractLabelsData = module.extractLabelsData;
		});

		it("should return null for null actor", () => {
			expect(extractLabelsData(null)).toBeNull();
		});

		it("should return null for undefined actor", () => {
			expect(extractLabelsData(undefined)).toBeNull();
		});

		it("should extract basic label values", () => {
			const actor = createCharacterWithLabels({
				danger: 2,
				freak: -1,
				savior: 1,
				superior: 0,
				mundane: 3,
			});

			const data = extractLabelsData(actor);
			expect(data).not.toBeNull();
			expect(data!.labels.danger).toBe(2);
			expect(data!.labels.freak).toBe(-1);
			expect(data!.labels.savior).toBe(1);
			expect(data!.labels.superior).toBe(0);
			expect(data!.labels.mundane).toBe(3);
		});

		it("should apply condition penalties (-2 each)", () => {
			const actor = createCharacterWithConditions(
				{ afraid: true }, // -2 to danger
				{ name: "Conditioned Hero" }
			);
			// Set base danger to 2
			(actor.system.stats as Record<string, { value: number }>).danger.value = 2;

			const data = extractLabelsData(actor);
			expect(data!.labels.danger).toBe(0); // 2 - 2 = 0
			expect(data!.affectedLabels.has("danger")).toBe(true);
		});

		it("should apply multiple condition penalties", () => {
			const actor = createCharacterWithConditions({
				afraid: true, // -2 danger
				insecure: true, // -2 savior
			});
			(actor.system.stats as Record<string, { value: number }>).danger.value = 1;
			(actor.system.stats as Record<string, { value: number }>).savior.value = 2;

			const data = extractLabelsData(actor);
			expect(data!.labels.danger).toBe(-1); // 1 - 2 = -1
			expect(data!.labels.savior).toBe(0); // 2 - 2 = 0
			expect(data!.affectedLabels.size).toBe(2);
			expect(data!.totalPenalty).toBe(4); // 2 conditions * 2
		});

		it("should apply forward bonus to all labels", () => {
			const actor = createCharacterWithBonuses(2, 0);
			(actor.system.stats as Record<string, { value: number }>).danger.value = 1;

			const data = extractLabelsData(actor);
			expect(data!.labels.danger).toBe(3); // 1 + 2 forward
			expect(data!.globalBonus).toBe(2);
			expect(data!.isPositive).toBe(true);
		});

		it("should apply ongoing bonus to all labels", () => {
			const actor = createCharacterWithBonuses(0, 1);
			(actor.system.stats as Record<string, { value: number }>).freak.value = 0;

			const data = extractLabelsData(actor);
			expect(data!.labels.freak).toBe(1); // 0 + 1 ongoing
			expect(data!.globalBonus).toBe(1);
		});

		it("should combine forward and ongoing bonuses", () => {
			const actor = createCharacterWithBonuses(1, 1);
			(actor.system.stats as Record<string, { value: number }>).mundane.value = 0;

			const data = extractLabelsData(actor);
			expect(data!.labels.mundane).toBe(2); // 0 + 1 + 1
			expect(data!.globalBonus).toBe(2);
		});

		it("should clamp effective values to MIN_VALUE (-3)", () => {
			const actor = createCharacterWithConditions({ afraid: true });
			(actor.system.stats as Record<string, { value: number }>).danger.value = -2;

			const data = extractLabelsData(actor);
			// -2 base - 2 penalty = -4, but clamped to -3
			expect(data!.labels.danger).toBe(-3);
		});

		it("should clamp effective values to MAX_VALUE (+4)", () => {
			const actor = createCharacterWithBonuses(3, 0);
			(actor.system.stats as Record<string, { value: number }>).danger.value = 3;

			const data = extractLabelsData(actor);
			// 3 base + 3 forward = 6, but clamped to 4
			expect(data!.labels.danger).toBe(4);
		});

		it("should set isPositive when globalBonus >= 1", () => {
			const actor = createCharacterWithBonuses(1, 0);
			const data = extractLabelsData(actor);
			expect(data!.isPositive).toBe(true);
		});

		it("should set isNegative when penalties > bonus", () => {
			const actor = createCharacterWithConditions({ afraid: true, angry: true });
			const data = extractLabelsData(actor);
			// totalPenalty = 4, globalBonus = 0
			expect(data!.isNegative).toBe(true);
		});

		it("should not set isNegative when bonus >= penalties", () => {
			const actor = createCharacterWithConditions({ afraid: true }); // -2 penalty
			// Add forward bonus to offset
			(actor.system.resources as Record<string, { value: number }>).forward.value = 2;

			const data = extractLabelsData(actor);
			// totalPenalty = 2, globalBonus = 2
			expect(data!.isNegative).toBe(false);
		});
	});
});

describe("labels-graph SVG generation", () => {
	describe("generateLabelsGraphSVG", () => {
		let generateLabelsGraphSVG: (options: {
			labels?: Record<string, number>;
			isPositive?: boolean;
			isNegative?: boolean;
			size?: number;
			borderWidth?: number;
			showInnerLines?: boolean;
			showIcons?: boolean;
			showVertexDots?: boolean;
		}) => string;

		beforeAll(async () => {
			const module = await import("../../src/module/labels-graph");
			generateLabelsGraphSVG = module.generateLabelsGraphSVG;
		});

		it("should return valid SVG string", () => {
			const svg = generateLabelsGraphSVG({ labels: { danger: 0, freak: 0, savior: 0, superior: 0, mundane: 0 } });
			expect(svg).toMatch(/^<svg/);
			expect(svg).toMatch(/<\/svg>$/);
		});

		it("should include labels-graph-svg class", () => {
			const svg = generateLabelsGraphSVG({ labels: {} });
			expect(svg).toContain('class="labels-graph-svg"');
		});

		it("should include data polygon with labels-graph-data class", () => {
			const svg = generateLabelsGraphSVG({ labels: { danger: 1 } });
			expect(svg).toContain('class="labels-graph-data"');
		});

		it("should use default yellow colors when not positive/negative", () => {
			const svg = generateLabelsGraphSVG({ labels: {}, isPositive: false, isNegative: false });
			expect(svg).toContain("rgba(180, 160, 90"); // Default fill
		});

		it("should use green colors when isPositive", () => {
			const svg = generateLabelsGraphSVG({ labels: {}, isPositive: true });
			expect(svg).toContain("rgba(60, 180, 80"); // Bonus fill
		});

		it("should use red colors when isNegative", () => {
			const svg = generateLabelsGraphSVG({ labels: {}, isNegative: true });
			expect(svg).toContain("rgba(180, 60, 60"); // Condition fill
		});

		it("should respect size option", () => {
			const svg = generateLabelsGraphSVG({ labels: {}, size: 100 });
			expect(svg).toContain('width="100"');
			expect(svg).toContain('height="100"');
		});

		it("should show inner grid lines by default", () => {
			const svg = generateLabelsGraphSVG({ labels: {} });
			// Inner grid lines have specific stroke opacity
			expect(svg).toContain("rgba(255, 255, 255, 0.25)");
		});

		it("should hide inner lines when showInnerLines is false", () => {
			const svgWithLines = generateLabelsGraphSVG({ labels: {}, showInnerLines: true });
			const svgWithoutLines = generateLabelsGraphSVG({ labels: {}, showInnerLines: false });
			// The one without lines should have fewer path elements
			expect(svgWithoutLines.split("<path").length).toBeLessThan(svgWithLines.split("<path").length);
		});

		it("should show icons when showIcons is true", () => {
			const svg = generateLabelsGraphSVG({ labels: {}, showIcons: true });
			expect(svg).toContain("<text");
			expect(svg).toContain("label-icon-vertex");
		});

		it("should show vertex dots when showVertexDots is true", () => {
			const svg = generateLabelsGraphSVG({ labels: {}, showVertexDots: true });
			expect(svg).toContain('class="vertex-dot"');
			expect(svg).toContain("<circle");
		});
	});

	describe("generateLabelsTooltip", () => {
		let generateLabelsTooltip: (
			labels: Record<string, number>,
			affectedLabels?: Set<string>
		) => string;

		beforeAll(async () => {
			const module = await import("../../src/module/labels-graph");
			generateLabelsTooltip = module.generateLabelsTooltip;
		});

		it("should format all labels with abbreviations", () => {
			const labels = { danger: 2, freak: -1, savior: 1, superior: 0, mundane: 3 };
			const tooltip = generateLabelsTooltip(labels);
			expect(tooltip).toContain("DAN: 2");
			expect(tooltip).toContain("FRE: -1");
			expect(tooltip).toContain("SAV: 1");
			expect(tooltip).toContain("SUP: 0");
			expect(tooltip).toContain("MUN: 3");
		});

		it("should separate labels with pipes", () => {
			const labels = { danger: 0, freak: 0, savior: 0, superior: 0, mundane: 0 };
			const tooltip = generateLabelsTooltip(labels);
			expect(tooltip.split(" | ")).toHaveLength(5);
		});

		it("should mark affected labels with asterisk", () => {
			const labels = { danger: 0, freak: 1, savior: 2, superior: 0, mundane: 1 };
			const affected = new Set(["danger", "savior"]);
			const tooltip = generateLabelsTooltip(labels, affected);
			expect(tooltip).toContain("DAN: 0*");
			expect(tooltip).toContain("SAV: 2*");
			expect(tooltip).not.toContain("FRE: 1*");
		});

		it("should handle empty affected set", () => {
			const labels = { danger: 1 };
			const tooltip = generateLabelsTooltip(labels, new Set());
			expect(tooltip).not.toContain("*");
		});
	});

	describe("GRAPH_PRESETS", () => {
		let GRAPH_PRESETS: Record<string, unknown>;

		beforeAll(async () => {
			const module = await import("../../src/module/labels-graph");
			GRAPH_PRESETS = module.GRAPH_PRESETS;
		});

		it("should have turnCard preset", () => {
			expect(GRAPH_PRESETS.turnCard).toBeDefined();
			expect((GRAPH_PRESETS.turnCard as { size: number }).size).toBe(32);
		});

		it("should have characterSheet preset", () => {
			expect(GRAPH_PRESETS.characterSheet).toBeDefined();
			expect((GRAPH_PRESETS.characterSheet as { size: number }).size).toBe(200);
			expect((GRAPH_PRESETS.characterSheet as { showIcons: boolean }).showIcons).toBe(true);
		});

		it("should have callSheet preset", () => {
			expect(GRAPH_PRESETS.callSheet).toBeDefined();
			expect((GRAPH_PRESETS.callSheet as { size: number }).size).toBe(280);
		});

		it("should be frozen (immutable)", () => {
			expect(Object.isFrozen(GRAPH_PRESETS)).toBe(true);
		});
	});
});
