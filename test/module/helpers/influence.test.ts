/**
 * Tests for helpers/influence.ts
 * Influence tracking and normalization utilities
 */

import {
	createBasicCharacter,
	createCharacterWithInfluences,
} from "../../fixtures/actors";

describe("influence.ts", () => {
	// Test the pure utility functions
	let normalize: (s: unknown) => string;
	let actorRealName: (actor: unknown) => string;
	let candidateActorNames: (actor: unknown) => string[];
	let candidateTokenNames: (actor: unknown, token: unknown) => string[];
	let compositeKey: (actor: unknown, token?: unknown) => string;
	let readInfluences: (actor: unknown) => Array<{
		id?: string;
		name: string;
		hasInfluenceOver?: boolean;
		haveInfluenceOver?: boolean;
		locked?: boolean;
	}>;
	let NS: string;

	beforeAll(async () => {
		const module = await import("../../../src/module/helpers/influence");
		normalize = module.normalize;
		actorRealName = module.actorRealName;
		candidateActorNames = module.candidateActorNames;
		candidateTokenNames = module.candidateTokenNames;
		compositeKey = module.compositeKey;
		readInfluences = module.readInfluences;
		NS = module.NS;
	});

	describe("normalize", () => {
		describe("basic normalization", () => {
			it("should convert to lowercase", () => {
				expect(normalize("BEACON")).toBe("beacon");
				expect(normalize("BeAcOn")).toBe("beacon");
			});

			it("should remove whitespace", () => {
				expect(normalize("The Beacon")).toBe("beacon");
				expect(normalize("Iron   Man")).toBe("ironman");
				expect(normalize("  spaced  out  ")).toBe("spacedout");
			});

			it("should remove 'the' keyword", () => {
				expect(normalize("The Beacon")).toBe("beacon");
				expect(normalize("the legacy")).toBe("legacy");
				expect(normalize("THELEGACY")).toBe("legacy"); // embedded
			});

			it("should remove 'lady' keyword", () => {
				expect(normalize("Lady Victory")).toBe("victory");
				expect(normalize("LADY of the Lake")).toBe("oflake");
			});

			it("should remove 'sir' keyword", () => {
				expect(normalize("Sir Gallant")).toBe("gallant");
				expect(normalize("SIR KNIGHT")).toBe("knight");
			});

			it("should handle multiple keyword removals", () => {
				expect(normalize("The Lady of the Lake")).toBe("oflake");
				expect(normalize("Sir The Lady Knight")).toBe("knight");
			});
		});

		describe("edge cases", () => {
			it("should return empty string for null", () => {
				expect(normalize(null)).toBe("");
			});

			it("should return empty string for undefined", () => {
				expect(normalize(undefined)).toBe("");
			});

			it("should return empty string for empty string", () => {
				expect(normalize("")).toBe("");
			});

			it("should handle numbers", () => {
				expect(normalize(123)).toBe("123");
			});

			it("should handle strings with only keywords", () => {
				expect(normalize("the")).toBe("");
				expect(normalize("the lady sir")).toBe("");
			});

			it("should preserve other characters", () => {
				expect(normalize("Hero-123")).toBe("hero-123");
				expect(normalize("Star*Lord")).toBe("star*lord");
			});
		});

		describe("real-world examples", () => {
			it("should normalize superhero names consistently", () => {
				// Different variations should produce same key
				expect(normalize("The Beacon")).toBe(normalize("Beacon"));
				expect(normalize("THE BEACON")).toBe(normalize("the beacon"));

				// Common hero name patterns
				expect(normalize("Legacy")).toBe("legacy");
				expect(normalize("The Nova")).toBe("nova");
				expect(normalize("Lady Faultline")).toBe("faultline");
			});
		});
	});

	describe("actorRealName", () => {
		it("should return real name from actor system", () => {
			const actor = createBasicCharacter();
			(actor.system.attributes as Record<string, { value: string }>).realName = { value: "Alex Chen" };
			expect(actorRealName(actor)).toBe("Alex Chen");
		});

		it("should return empty string if no real name", () => {
			const actor = createBasicCharacter();
			expect(actorRealName(actor)).toBe("");
		});

		it("should return empty string for null actor", () => {
			expect(actorRealName(null)).toBe("");
		});

		it("should return empty string for missing path", () => {
			const actor = { system: {} };
			expect(actorRealName(actor)).toBe("");
		});
	});

	describe("candidateActorNames", () => {
		it("should return actor name", () => {
			const actor = createBasicCharacter({ name: "Beacon" });
			const names = candidateActorNames(actor);
			expect(names).toContain("Beacon");
		});

		it("should include real name if different", () => {
			const actor = createBasicCharacter({ name: "Beacon" });
			(actor.system.attributes as Record<string, { value: string }>).realName = { value: "Alex Chen" };

			const names = candidateActorNames(actor);
			expect(names).toContain("Beacon");
			expect(names).toContain("Alex Chen");
		});

		it("should not duplicate if real name equals actor name", () => {
			const actor = createBasicCharacter({ name: "Alex Chen" });
			(actor.system.attributes as Record<string, { value: string }>).realName = { value: "Alex Chen" };

			const names = candidateActorNames(actor);
			expect(names).toEqual(["Alex Chen"]);
		});

		it("should return empty array for null actor", () => {
			const names = candidateActorNames(null);
			expect(names).toEqual([]);
		});

		it("should filter out falsy names", () => {
			const actor = createBasicCharacter({ name: "" });
			const names = candidateActorNames(actor);
			expect(names).toEqual([]);
		});
	});

	describe("candidateTokenNames", () => {
		it("should include actor names", () => {
			const actor = createBasicCharacter({ name: "Beacon" });
			const names = candidateTokenNames(actor, null);
			expect(names).toContain("Beacon");
		});

		it("should include token name if different", () => {
			const actor = createBasicCharacter({ name: "Beacon" });
			const token = { name: "The Beacon (Token)" };

			const names = candidateTokenNames(actor, token);
			expect(names).toContain("Beacon");
			expect(names).toContain("The Beacon (Token)");
		});

		it("should handle token with document.name", () => {
			const actor = createBasicCharacter({ name: "Legacy" });
			const token = { document: { name: "Legacy Clone" } };

			const names = candidateTokenNames(actor, token);
			expect(names).toContain("Legacy Clone");
		});

		it("should not duplicate if token name equals actor name", () => {
			const actor = createBasicCharacter({ name: "Nova" });
			const token = { name: "Nova" };

			const names = candidateTokenNames(actor, token);
			expect(names.filter((n) => n === "Nova")).toHaveLength(1);
		});
	});

	describe("compositeKey", () => {
		it("should create normalized composite key from actor", () => {
			const actor = createBasicCharacter({ name: "The Beacon" });
			const key = compositeKey(actor, null);
			expect(key).toBe("beacon");
		});

		it("should include token name in key", () => {
			const actor = createBasicCharacter({ name: "Legacy" });
			const token = { name: "Legacy Alt" };

			const key = compositeKey(actor, token);
			expect(key).toContain("legacy");
			expect(key).toContain("legacyalt");
		});

		it("should join names with separator", () => {
			const actor = createBasicCharacter({ name: "Hero" });
			(actor.system.attributes as Record<string, { value: string }>).realName = { value: "Alex" };
			const token = { name: "HeroToken" };

			const key = compositeKey(actor, token);
			// Should contain pipe-separated normalized parts
			expect(key).toContain("|");
		});

		it("should return empty string for null actor", () => {
			const key = compositeKey(null);
			expect(key).toBe("");
		});
	});

	describe("readInfluences", () => {
		it("should return influences from primary namespace", () => {
			const actor = createCharacterWithInfluences([
				{ name: "Legacy", hasInfluenceOver: true },
				{ name: "Nova", haveInfluenceOver: true },
			]);

			const influences = readInfluences(actor);
			expect(influences).toHaveLength(2);
			expect(influences[0].name).toBe("Legacy");
			expect(influences[1].name).toBe("Nova");
		});

		it("should return deep clone (not reference)", () => {
			const actor = createCharacterWithInfluences([
				{ name: "Legacy", hasInfluenceOver: true },
			]);

			const influences1 = readInfluences(actor);
			const influences2 = readInfluences(actor);

			// Modify one
			influences1[0].name = "Modified";

			// Other should be unaffected
			expect(influences2[0].name).toBe("Legacy");
		});

		it("should return empty array for actor without influences", () => {
			const actor = createBasicCharacter();
			const influences = readInfluences(actor);
			expect(influences).toEqual([]);
		});

		it("should fall back to legacy namespace", () => {
			const actor = createBasicCharacter();
			// Set influences on legacy namespace
			actor.flags["masks-newgeneration-sheets"] = {
				influences: [{ name: "OldInfluence", hasInfluenceOver: true }],
			};

			const influences = readInfluences(actor);
			expect(influences).toHaveLength(1);
			expect(influences[0].name).toBe("OldInfluence");
		});

		it("should fall back to dispatch namespace", () => {
			const actor = createBasicCharacter();
			actor.flags["dispatch"] = {
				influences: [{ name: "DispatchInfluence", haveInfluenceOver: true }],
			};

			const influences = readInfluences(actor);
			expect(influences).toHaveLength(1);
			expect(influences[0].name).toBe("DispatchInfluence");
		});

		it("should prefer primary namespace over legacy", () => {
			const actor = createBasicCharacter();
			actor.flags["masks-newgeneration-unofficial"] = {
				influences: [{ name: "Primary" }],
			};
			actor.flags["dispatch"] = {
				influences: [{ name: "Legacy" }],
			};

			const influences = readInfluences(actor);
			expect(influences[0].name).toBe("Primary");
		});

		it("should handle null actor", () => {
			// This may throw or return empty - depends on implementation
			const influences = readInfluences(null);
			expect(influences).toEqual([]);
		});
	});

	describe("NS constant", () => {
		it("should be the module namespace", () => {
			expect(NS).toBe("masks-newgeneration-unofficial");
		});
	});
});

describe("influence matching scenarios", () => {
	let normalize: (s: unknown) => string;

	beforeAll(async () => {
		const module = await import("../../../src/module/helpers/influence");
		normalize = module.normalize;
	});

	describe("fuzzy matching for common variations", () => {
		it("should match 'The Beacon' to 'Beacon'", () => {
			expect(normalize("The Beacon")).toBe(normalize("Beacon"));
		});

		it("should match different capitalizations", () => {
			expect(normalize("LEGACY")).toBe(normalize("legacy"));
			expect(normalize("Legacy")).toBe(normalize("LEGACY"));
		});

		it("should match with/without 'Lady' prefix", () => {
			expect(normalize("Lady Faultline")).toBe(normalize("Faultline"));
		});

		it("should handle embedded keywords", () => {
			// 'the' in 'mother' should be removed (intentionally lax per spec)
			expect(normalize("mother")).toBe("mor");
			expect(normalize("weather")).toBe("wear");
		});
	});

	describe("substring matching patterns", () => {
		it("should allow token name to differ from actor name", () => {
			// Common scenario: token named differently for combat
			const actorName = "Beacon";
			const tokenName = "The Beacon (Armored)";

			const actorKey = normalize(actorName);
			const tokenKey = normalize(tokenName);

			// Beacon should be substring of token key
			expect(tokenKey).toContain(actorKey);
		});
	});
});
