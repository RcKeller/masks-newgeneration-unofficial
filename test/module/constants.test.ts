/**
 * Tests for constants.ts
 * Module constants and configuration
 */

describe("constants", () => {
	let MODULE_ID: string;
	let NS: string;
	let SOCKET_NS: string;
	let BASE_LABEL_KEYS: readonly string[];
	let LABEL_BOUNDS: {
		MIN: number;
		MAX: number;
		ROLL_MIN: number;
		ROLL_MAX: number;
	};
	let CONDITIONS: readonly string[];
	let CONDITION_TO_LABEL: Record<string, string>;
	let LEGACY_NAMESPACES: readonly string[];

	beforeAll(async () => {
		const module = await import("../../src/module/constants");
		MODULE_ID = module.MODULE_ID;
		NS = module.NS;
		SOCKET_NS = module.SOCKET_NS;
		BASE_LABEL_KEYS = module.BASE_LABEL_KEYS;
		LABEL_BOUNDS = module.LABEL_BOUNDS;
		CONDITIONS = module.CONDITIONS;
		CONDITION_TO_LABEL = module.CONDITION_TO_LABEL;
		LEGACY_NAMESPACES = module.LEGACY_NAMESPACES;
	});

	describe("MODULE_ID", () => {
		it("should be the correct module identifier", () => {
			expect(MODULE_ID).toBe("masks-newgeneration-unofficial");
		});
	});

	describe("NS", () => {
		it("should be an alias for MODULE_ID", () => {
			expect(NS).toBe(MODULE_ID);
		});
	});

	describe("SOCKET_NS", () => {
		it("should be module.{MODULE_ID}", () => {
			expect(SOCKET_NS).toBe("module.masks-newgeneration-unofficial");
		});
	});

	describe("BASE_LABEL_KEYS", () => {
		it("should contain all 5 Masks labels", () => {
			expect(BASE_LABEL_KEYS).toEqual(["danger", "freak", "savior", "superior", "mundane"]);
		});

		it("should be frozen", () => {
			expect(Object.isFrozen(BASE_LABEL_KEYS)).toBe(true);
		});
	});

	describe("LABEL_BOUNDS", () => {
		it("should have correct shift bounds", () => {
			expect(LABEL_BOUNDS.MIN).toBe(-2);
			expect(LABEL_BOUNDS.MAX).toBe(3);
		});

		it("should have correct roll calculation bounds", () => {
			expect(LABEL_BOUNDS.ROLL_MIN).toBe(-3);
			expect(LABEL_BOUNDS.ROLL_MAX).toBe(4);
		});

		it("should be frozen", () => {
			expect(Object.isFrozen(LABEL_BOUNDS)).toBe(true);
		});
	});

	describe("CONDITIONS", () => {
		it("should contain all 5 Masks conditions", () => {
			expect(CONDITIONS).toEqual(["afraid", "angry", "guilty", "hopeless", "insecure"]);
		});

		it("should be frozen", () => {
			expect(Object.isFrozen(CONDITIONS)).toBe(true);
		});
	});

	describe("CONDITION_TO_LABEL", () => {
		it("should map conditions to correct labels", () => {
			expect(CONDITION_TO_LABEL.afraid).toBe("danger");
			expect(CONDITION_TO_LABEL.angry).toBe("mundane");
			expect(CONDITION_TO_LABEL.guilty).toBe("superior");
			expect(CONDITION_TO_LABEL.hopeless).toBe("freak");
			expect(CONDITION_TO_LABEL.insecure).toBe("savior");
		});

		it("should be frozen", () => {
			expect(Object.isFrozen(CONDITION_TO_LABEL)).toBe(true);
		});
	});

	describe("LEGACY_NAMESPACES", () => {
		it("should include old namespace for migration", () => {
			expect(LEGACY_NAMESPACES).toContain("masks-newgeneration-sheets");
			expect(LEGACY_NAMESPACES).toContain("dispatch");
		});

		it("should be frozen", () => {
			expect(Object.isFrozen(LEGACY_NAMESPACES)).toBe(true);
		});
	});
});
