/**
 * Tests for helpers/shift-labels.ts
 * Label shifting functionality for Masks character sheets
 */

import {
	createBasicCharacter,
	createCharacterWithLabels,
	createCharacterWithPlaybook,
	createCharacterWithLockedLabels,
	createCharacterAtLabelBounds,
} from "../../fixtures/actors";

describe("shift-labels.ts", () => {
	// We'll test the exported pure functions
	let getLabelKeysForActor: (actor: unknown) => string[];
	let getLabelPath: (key: string) => string;
	let getLabelValue: (actor: unknown, key: string) => number;
	let getShiftableLabels: (actor: unknown) => {
		canShiftUp: string[];
		canShiftDown: string[];
		labelKeys: string[];
	};

	beforeAll(async () => {
		const module = await import("../../../src/module/helpers/shift-labels");
		getLabelKeysForActor = module.getLabelKeysForActor;
		getLabelPath = module.getLabelPath;
		getLabelValue = module.getLabelValue;
		getShiftableLabels = module.getShiftableLabels;
	});

	describe("getLabelKeysForActor", () => {
		it("should return 5 base labels for standard playbooks", () => {
			const actor = createBasicCharacter();
			const keys = getLabelKeysForActor(actor);
			expect(keys).toEqual(["danger", "freak", "savior", "superior", "mundane"]);
		});

		it("should return 6 labels for The Soldier playbook", () => {
			const actor = createCharacterWithPlaybook("The Soldier");
			const keys = getLabelKeysForActor(actor);
			expect(keys).toEqual(["danger", "freak", "savior", "superior", "mundane", "soldier"]);
		});

		it("should return base labels for other playbooks", () => {
			const playbooks = [
				"The Beacon",
				"The Bull",
				"The Delinquent",
				"The Doomed",
				"The Janus",
				"The Legacy",
				"The Nova",
				"The Outsider",
				"The Protege",
				"The Transformed",
			];

			for (const playbook of playbooks) {
				const actor = createCharacterWithPlaybook(playbook);
				const keys = getLabelKeysForActor(actor);
				expect(keys).toHaveLength(5);
				expect(keys).not.toContain("soldier");
			}
		});

		it("should handle actor with no playbook", () => {
			const actor = createBasicCharacter();
			(actor.system.playbook as { name: string }).name = "";
			const keys = getLabelKeysForActor(actor);
			expect(keys).toHaveLength(5);
		});
	});

	describe("getLabelPath", () => {
		it("should return correct path for standard labels", () => {
			expect(getLabelPath("danger")).toBe("system.stats.danger.value");
			expect(getLabelPath("freak")).toBe("system.stats.freak.value");
			expect(getLabelPath("savior")).toBe("system.stats.savior.value");
			expect(getLabelPath("superior")).toBe("system.stats.superior.value");
			expect(getLabelPath("mundane")).toBe("system.stats.mundane.value");
		});

		it("should return special path for soldier label", () => {
			expect(getLabelPath("soldier")).toBe("system.attributes.theSoldier.value");
		});
	});

	describe("getLabelValue", () => {
		it("should return label value from actor", () => {
			const actor = createCharacterWithLabels({
				danger: 2,
				freak: -1,
				savior: 1,
				superior: 0,
				mundane: 3,
			});

			expect(getLabelValue(actor, "danger")).toBe(2);
			expect(getLabelValue(actor, "freak")).toBe(-1);
			expect(getLabelValue(actor, "savior")).toBe(1);
			expect(getLabelValue(actor, "superior")).toBe(0);
			expect(getLabelValue(actor, "mundane")).toBe(3);
		});

		it("should return 0 for missing label", () => {
			const actor = createBasicCharacter();
			// Remove a label
			delete (actor.system.stats as Record<string, unknown>).danger;
			expect(getLabelValue(actor, "danger")).toBe(0);
		});

		it("should return 0 for non-numeric label", () => {
			const actor = createBasicCharacter();
			(actor.system.stats as Record<string, { value: unknown }>).danger.value = "not a number";
			expect(getLabelValue(actor, "danger")).toBe(0);
		});
	});

	describe("getShiftableLabels", () => {
		describe("canShiftUp", () => {
			it("should include labels below maximum (+3)", () => {
				const actor = createCharacterWithLabels({
					danger: 0,
					freak: 1,
					savior: 2,
					superior: -1,
					mundane: -2,
				});

				const { canShiftUp } = getShiftableLabels(actor);
				expect(canShiftUp).toContain("danger");
				expect(canShiftUp).toContain("freak");
				expect(canShiftUp).toContain("savior");
				expect(canShiftUp).toContain("superior");
				expect(canShiftUp).toContain("mundane");
			});

			it("should exclude labels at maximum (+3)", () => {
				const actor = createCharacterWithLabels({
					danger: 3, // At max
					freak: 2,
					savior: 0,
					superior: 0,
					mundane: 0,
				});

				const { canShiftUp } = getShiftableLabels(actor);
				expect(canShiftUp).not.toContain("danger");
				expect(canShiftUp).toContain("freak");
			});

			it("should exclude locked labels", () => {
				const actor = createCharacterWithLockedLabels(
					{ danger: true, freak: false },
					{ name: "Locked Hero" }
				);
				// Set labels below max so they would normally be shiftable
				(actor.system.stats as Record<string, { value: number }>).danger.value = 0;
				(actor.system.stats as Record<string, { value: number }>).freak.value = 0;

				const { canShiftUp } = getShiftableLabels(actor);
				expect(canShiftUp).not.toContain("danger"); // Locked
				expect(canShiftUp).toContain("freak"); // Not locked
			});
		});

		describe("canShiftDown", () => {
			it("should include labels above minimum (-2)", () => {
				const actor = createCharacterWithLabels({
					danger: 0,
					freak: 1,
					savior: 2,
					superior: -1,
					mundane: 3,
				});

				const { canShiftDown } = getShiftableLabels(actor);
				expect(canShiftDown).toContain("danger");
				expect(canShiftDown).toContain("freak");
				expect(canShiftDown).toContain("savior");
				expect(canShiftDown).toContain("superior");
				expect(canShiftDown).toContain("mundane");
			});

			it("should exclude labels at minimum (-2)", () => {
				const actor = createCharacterWithLabels({
					danger: -2, // At min
					freak: -1,
					savior: 0,
					superior: 0,
					mundane: 0,
				});

				const { canShiftDown } = getShiftableLabels(actor);
				expect(canShiftDown).not.toContain("danger");
				expect(canShiftDown).toContain("freak");
			});

			it("should exclude locked labels", () => {
				const actor = createCharacterWithLockedLabels(
					{ savior: true },
					{ name: "Locked Savior" }
				);
				(actor.system.stats as Record<string, { value: number }>).savior.value = 2;

				const { canShiftDown } = getShiftableLabels(actor);
				expect(canShiftDown).not.toContain("savior");
			});
		});

		describe("edge cases", () => {
			it("should return correct labelKeys for playbook", () => {
				const actor = createCharacterWithPlaybook("The Soldier");
				const { labelKeys } = getShiftableLabels(actor);
				expect(labelKeys).toContain("soldier");
				expect(labelKeys).toHaveLength(6);
			});

			it("should handle character at both bounds", () => {
				const actor = createCharacterAtLabelBounds("danger", "freak");
				// danger = -2 (min), freak = 3 (max)

				const { canShiftUp, canShiftDown } = getShiftableLabels(actor);
				expect(canShiftUp).not.toContain("freak"); // At max
				expect(canShiftUp).toContain("danger"); // Below max
				expect(canShiftDown).not.toContain("danger"); // At min
				expect(canShiftDown).toContain("freak"); // Above min
			});

			it("should handle all labels at maximum", () => {
				const actor = createCharacterWithLabels({
					danger: 3,
					freak: 3,
					savior: 3,
					superior: 3,
					mundane: 3,
				});

				const { canShiftUp } = getShiftableLabels(actor);
				expect(canShiftUp).toHaveLength(0);
			});

			it("should handle all labels at minimum", () => {
				const actor = createCharacterWithLabels({
					danger: -2,
					freak: -2,
					savior: -2,
					superior: -2,
					mundane: -2,
				});

				const { canShiftDown } = getShiftableLabels(actor);
				expect(canShiftDown).toHaveLength(0);
			});

			it("should handle all labels locked", () => {
				const actor = createCharacterWithLockedLabels({
					danger: true,
					freak: true,
					savior: true,
					superior: true,
					mundane: true,
				});

				const { canShiftUp, canShiftDown } = getShiftableLabels(actor);
				expect(canShiftUp).toHaveLength(0);
				expect(canShiftDown).toHaveLength(0);
			});
		});
	});

	describe("label bounds", () => {
		// Test that the shift bounds are correct
		it("should use -2 as minimum for shifts", () => {
			const actor = createCharacterWithLabels({ danger: -2 });
			const { canShiftDown } = getShiftableLabels(actor);
			expect(canShiftDown).not.toContain("danger");
		});

		it("should use +3 as maximum for shifts", () => {
			const actor = createCharacterWithLabels({ danger: 3 });
			const { canShiftUp } = getShiftableLabels(actor);
			expect(canShiftUp).not.toContain("danger");
		});

		it("should allow shift up at +2", () => {
			const actor = createCharacterWithLabels({ danger: 2 });
			const { canShiftUp } = getShiftableLabels(actor);
			expect(canShiftUp).toContain("danger");
		});

		it("should allow shift down at -1", () => {
			const actor = createCharacterWithLabels({ danger: -1 });
			const { canShiftDown } = getShiftableLabels(actor);
			expect(canShiftDown).toContain("danger");
		});
	});
});
