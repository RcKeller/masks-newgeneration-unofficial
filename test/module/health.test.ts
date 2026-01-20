/**
 * Tests for health.ts
 * HP derivation and condition counting logic
 */

import {
	createBasicCharacter,
	createBasicNPC,
	createCharacterWithConditions,
	createNPCWithTier,
} from "../fixtures/actors";
import { mockFoundry, mockGetProperty } from "../__mocks__/foundry";

// Since health.ts has side effects (Hooks.once), we need to test the pure functions
// We'll extract and test the core logic directly

describe("health.ts pure functions", () => {
	// Re-implement the pure functions here for testing since they're not exported
	// This tests the logic without the Foundry integration

	const PATH = {
		HP: "system.attributes.hp",
		HP_VAL: "system.attributes.hp.value",
		HP_MAX: "system.attributes.hp.max",
		TIER: "system.attributes.tier.value",
		COND_OPTS: "system.attributes.conditions.options",
	};

	function clamp(n: unknown, lo: number, hi: number): number {
		const x = Number(n);
		if (!Number.isFinite(x)) return lo;
		return Math.min(hi, Math.max(lo, Math.floor(x)));
	}

	function countActiveConditions(dataLike: unknown): number {
		const opts = mockGetProperty(dataLike, PATH.COND_OPTS) as Record<string, { value: boolean }> | undefined;
		if (!opts || typeof opts !== "object") return 0;
		let n = 0;
		for (const v of Object.values(opts)) if (v?.value === true) n++;
		return n;
	}

	function deriveHP(actor: unknown): { value: number; max: number } {
		const isChar = (actor as { type?: string })?.type === "character";
		let max = isChar ? 5 : Number(mockGetProperty(actor, PATH.TIER));
		if (!Number.isFinite(max)) max = isChar ? 5 : 5;
		max = clamp(max, 0, 5);

		const conds = countActiveConditions(actor);
		const value = Math.max(0, max - conds);
		return { value, max };
	}

	describe("clamp", () => {
		it("should return value when within bounds", () => {
			expect(clamp(3, 0, 5)).toBe(3);
		});

		it("should return lo when value is below minimum", () => {
			expect(clamp(-1, 0, 5)).toBe(0);
		});

		it("should return hi when value is above maximum", () => {
			expect(clamp(10, 0, 5)).toBe(5);
		});

		it("should return lo for NaN", () => {
			expect(clamp(NaN, 0, 5)).toBe(0);
		});

		it("should return lo for Infinity", () => {
			expect(clamp(Infinity, 0, 5)).toBe(0);
		});

		it("should return lo for -Infinity", () => {
			expect(clamp(-Infinity, 0, 5)).toBe(0);
		});

		it("should floor decimal values", () => {
			expect(clamp(3.7, 0, 5)).toBe(3);
			expect(clamp(3.2, 0, 5)).toBe(3);
		});

		it("should handle string numbers", () => {
			expect(clamp("3", 0, 5)).toBe(3);
		});

		it("should return lo for non-numeric strings", () => {
			expect(clamp("abc", 0, 5)).toBe(0);
		});

		it("should handle null/undefined", () => {
			expect(clamp(null, 0, 5)).toBe(0);
			expect(clamp(undefined, 0, 5)).toBe(0);
		});
	});

	describe("countActiveConditions", () => {
		it("should return 0 for character with no conditions", () => {
			const actor = createBasicCharacter();
			expect(countActiveConditions(actor)).toBe(0);
		});

		it("should return 1 for character with one condition", () => {
			const actor = createCharacterWithConditions({ afraid: true });
			expect(countActiveConditions(actor)).toBe(1);
		});

		it("should return 2 for character with two conditions", () => {
			const actor = createCharacterWithConditions({ afraid: true, angry: true });
			expect(countActiveConditions(actor)).toBe(2);
		});

		it("should return 5 for character with all conditions", () => {
			const actor = createCharacterWithConditions({
				afraid: true,
				angry: true,
				guilty: true,
				hopeless: true,
				insecure: true,
			});
			expect(countActiveConditions(actor)).toBe(5);
		});

		it("should return 0 for null/undefined", () => {
			expect(countActiveConditions(null)).toBe(0);
			expect(countActiveConditions(undefined)).toBe(0);
		});

		it("should return 0 for object without conditions path", () => {
			expect(countActiveConditions({})).toBe(0);
			expect(countActiveConditions({ system: {} })).toBe(0);
		});

		it("should not count false conditions", () => {
			const actor = createCharacterWithConditions({
				afraid: false,
				angry: true,
				guilty: false,
			});
			expect(countActiveConditions(actor)).toBe(1);
		});
	});

	describe("deriveHP", () => {
		describe("for characters", () => {
			it("should return max 5 HP for healthy character", () => {
				const actor = createBasicCharacter();
				const hp = deriveHP(actor);
				expect(hp.max).toBe(5);
				expect(hp.value).toBe(5);
			});

			it("should reduce HP by 1 per condition", () => {
				const actor = createCharacterWithConditions({ afraid: true });
				const hp = deriveHP(actor);
				expect(hp.max).toBe(5);
				expect(hp.value).toBe(4);
			});

			it("should reduce HP by 2 for two conditions", () => {
				const actor = createCharacterWithConditions({ afraid: true, angry: true });
				const hp = deriveHP(actor);
				expect(hp.value).toBe(3);
			});

			it("should reduce HP to 0 with all 5 conditions", () => {
				const actor = createCharacterWithConditions({
					afraid: true,
					angry: true,
					guilty: true,
					hopeless: true,
					insecure: true,
				});
				const hp = deriveHP(actor);
				expect(hp.value).toBe(0);
			});

			it("should not go below 0 HP", () => {
				// Create character and manually add more "conditions" somehow
				// In practice this can't happen, but test the floor
				const actor = createCharacterWithConditions({
					afraid: true,
					angry: true,
					guilty: true,
					hopeless: true,
					insecure: true,
				});
				const hp = deriveHP(actor);
				expect(hp.value).toBeGreaterThanOrEqual(0);
			});
		});

		describe("for NPCs", () => {
			it("should use tier as max HP", () => {
				const npc = createNPCWithTier(3);
				const hp = deriveHP(npc);
				expect(hp.max).toBe(3);
				expect(hp.value).toBe(3);
			});

			it("should default to tier 5 if not set", () => {
				const npc = createBasicNPC();
				// Remove tier
				delete (npc.system.attributes as Record<string, unknown>).tier;
				const hp = deriveHP(npc);
				expect(hp.max).toBe(5);
			});

			it("should clamp tier to 0-5 range", () => {
				const npc = createNPCWithTier(10);
				const hp = deriveHP(npc);
				expect(hp.max).toBe(5);

				const npc2 = createNPCWithTier(-2);
				const hp2 = deriveHP(npc2);
				expect(hp2.max).toBe(0);
			});

			it("should reduce NPC HP by conditions", () => {
				const npc = createNPCWithTier(4);
				// Manually set conditions on NPC
				const opts = (npc.system.attributes as { conditions: { options: Record<number, { value: boolean }> } }).conditions.options;
				opts[0].value = true; // Afraid
				opts[1].value = true; // Angry

				const hp = deriveHP(npc);
				expect(hp.max).toBe(4);
				expect(hp.value).toBe(2); // 4 - 2 conditions
			});

			it("should handle tier 0 NPC", () => {
				const npc = createNPCWithTier(0);
				const hp = deriveHP(npc);
				expect(hp.max).toBe(0);
				expect(hp.value).toBe(0);
			});
		});

		describe("edge cases", () => {
			it("should handle null actor", () => {
				const hp = deriveHP(null);
				// Should treat as non-character with no valid tier -> default 5
				expect(hp.max).toBe(5);
			});

			it("should handle actor with missing system data", () => {
				const hp = deriveHP({ type: "character" });
				expect(hp.max).toBe(5);
				expect(hp.value).toBe(5);
			});
		});
	});

	describe("change detection helpers", () => {
		// Re-implement the change detection logic for testing

		function didConditionsChange(changes: Record<string, unknown> | null): boolean {
			const flat = mockFoundry.utils.flattenObject(changes || {});
			for (const k of Object.keys(flat)) {
				if (k === PATH.COND_OPTS || k.startsWith(`${PATH.COND_OPTS}.`)) return true;
				const tok = `actorData.${PATH.COND_OPTS}`;
				if (k === tok || k.startsWith(`${tok}.`)) return true;
			}
			return false;
		}

		function didTierChange(changes: Record<string, unknown> | null): boolean {
			const flat = mockFoundry.utils.flattenObject(changes || {});
			return (
				flat[PATH.TIER] !== undefined || flat[`actorData.${PATH.TIER}`] !== undefined
			);
		}

		describe("didConditionsChange", () => {
			it("should return false for empty changes", () => {
				expect(didConditionsChange({})).toBe(false);
				expect(didConditionsChange(null)).toBe(false);
			});

			it("should return true when conditions path is in changes", () => {
				const changes = {
					system: {
						attributes: {
							conditions: {
								options: { 0: { value: true } },
							},
						},
					},
				};
				expect(didConditionsChange(changes)).toBe(true);
			});

			it("should return true for nested condition changes", () => {
				const changes = {
					"system.attributes.conditions.options.0.value": true,
				};
				expect(didConditionsChange(changes)).toBe(true);
			});

			it("should return false for unrelated changes", () => {
				const changes = {
					name: "New Name",
					"system.stats.danger.value": 2,
				};
				expect(didConditionsChange(changes)).toBe(false);
			});
		});

		describe("didTierChange", () => {
			it("should return false for empty changes", () => {
				expect(didTierChange({})).toBe(false);
				expect(didTierChange(null)).toBe(false);
			});

			it("should return true when tier is in changes", () => {
				const changes = {
					system: {
						attributes: {
							tier: { value: 3 },
						},
					},
				};
				expect(didTierChange(changes)).toBe(true);
			});

			it("should return true for flat tier path", () => {
				const changes = {
					"system.attributes.tier.value": 4,
				};
				expect(didTierChange(changes)).toBe(true);
			});

			it("should return false for unrelated changes", () => {
				const changes = {
					name: "Villain",
					"system.attributes.hp.value": 3,
				};
				expect(didTierChange(changes)).toBe(false);
			});
		});
	});
});
