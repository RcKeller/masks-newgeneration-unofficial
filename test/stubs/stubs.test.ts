/**
 * Tests for the stub infrastructure
 * Demonstrates the new testing capabilities: invocation tracking, poison pattern, state management
 */

import { StubActor } from "./foundry/StubActor";
import { StubNotificationService } from "./foundry/StubNotificationService";
import { StubSettings } from "./foundry/StubSettings";
import { StubHooks } from "./foundry/StubHooks";
import { StubActorCollection } from "./domain/StubActorCollection";
import { InvocationRecorder } from "./core/InvocationRecorder";
import { StateManager } from "./core/StateManager";
import { PoisonManager } from "./core/PoisonManager";
import {
	BEACON,
	LEGACY,
	SOLDIER,
	EDGE_CASE_MAX_DANGER,
	ALL_MAX_LABELS,
	SIPHON,
	createStandardScenario,
} from "../test_data/TestCharacters";

describe("Core Infrastructure", () => {
	describe("InvocationRecorder", () => {
		let recorder: InvocationRecorder;

		beforeEach(() => {
			recorder = new InvocationRecorder();
		});

		it("should record method invocations", () => {
			recorder.record("update", [{ "system.stats.danger.value": 2 }]);

			expect(recorder.wasCalled("update")).toBe(true);
			expect(recorder.callCount("update")).toBe(1);
		});

		it("should track multiple calls", () => {
			recorder.record("getFlag", ["ns", "key1"]);
			recorder.record("getFlag", ["ns", "key2"]);
			recorder.record("setFlag", ["ns", "key", "value"]);

			expect(recorder.callCount("getFlag")).toBe(2);
			expect(recorder.callCount("setFlag")).toBe(1);
		});

		it("should retrieve invocation arguments", () => {
			recorder.record("update", [{ danger: 2 }]);

			const invocations = recorder.getInvocationsFor("update");
			expect(invocations).toHaveLength(1);
			expect(invocations[0].args[0]).toEqual({ danger: 2 });
		});

		it("should check if called with specific arguments", () => {
			recorder.record("setFlag", ["masks-newgeneration-unofficial", "influences", []]);

			expect(
				recorder.wasCalledWith("setFlag", "masks-newgeneration-unofficial", "influences", []),
			).toBe(true);
			expect(recorder.wasCalledWith("setFlag", "other-namespace", "influences", [])).toBe(false);
		});
	});

	describe("StateManager", () => {
		it("should save and restore state", () => {
			const manager = new StateManager({ count: 0, name: "test" });

			manager.save();
			manager.setState({ count: 5, name: "modified" });

			expect(manager.getCurrentState()).toEqual({ count: 5, name: "modified" });

			manager.reset();
			expect(manager.getCurrentState()).toEqual({ count: 0, name: "test" });
		});

		it("should reset to empty state", () => {
			const manager = new StateManager({ count: 0 });
			manager.setState({ count: 10 });
			manager.save();
			manager.setState({ count: 20 });

			manager.resetToEmpty();

			expect(manager.getCurrentState()).toEqual({ count: 0 });
			expect(manager.hasSavedState()).toBe(false);
		});
	});

	describe("PoisonManager", () => {
		it("should throw when poisoned method is accessed", () => {
			const poison = new PoisonManager<string>();

			poison.poison("update", new Error("Database connection failed"));

			expect(() => poison.throwIfPoisoned("update")).toThrow("Database connection failed");
			expect(() => poison.throwIfPoisoned("getFlag")).not.toThrow();
		});

		it("should cure poisoned methods", () => {
			const poison = new PoisonManager<string>();
			poison.poison("update");

			poison.cure("update");

			expect(() => poison.throwIfPoisoned("update")).not.toThrow();
		});
	});
});

describe("StubActor", () => {
	describe("factory methods", () => {
		it("should create character with labels", () => {
			const actor = StubActor.withLabels({ danger: 2, freak: -1 });

			expect(actor.system.stats.danger.value).toBe(2);
			expect(actor.system.stats.freak.value).toBe(-1);
			expect(actor.system.stats.savior.value).toBe(0);
		});

		it("should create character with playbook", () => {
			const actor = StubActor.withPlaybook("The Soldier");

			expect(actor.system.playbook.name).toBe("The Soldier");
			expect(actor.system.attributes.theSoldier).toBeDefined();
		});

		it("should create NPC with tier", () => {
			const npc = StubActor.forNPC({ name: "Villain" });

			expect(npc.type).toBe("npc");
		});
	});

	describe("invocation tracking", () => {
		it("should track getFlag calls", () => {
			const actor = StubActor.forCharacter();

			actor.getFlag("masks-newgeneration-unofficial", "influences");

			expect(actor.wasCalled("getFlag")).toBe(true);
			expect(actor.getInvocationsFor("getFlag")[0].args).toEqual([
				"masks-newgeneration-unofficial",
				"influences",
			]);
		});

		it("should track update calls", async () => {
			const actor = StubActor.forCharacter();

			await actor.update({ "system.stats.danger.value": 3 });

			expect(actor.wasCalled("update")).toBe(true);
			expect(actor.callCount("update")).toBe(1);
		});
	});

	describe("poison pattern (error injection)", () => {
		it("should throw on poisoned update", async () => {
			const actor = StubActor.forCharacter();
			actor.poison("update", new Error("Update failed"));

			await expect(actor.update({})).rejects.toThrow("Update failed");
		});

		it("should cure poisoned methods", async () => {
			const actor = StubActor.forCharacter();
			actor.poison("setFlag");
			actor.cure("setFlag");

			await expect(actor.setFlag("ns", "key", "value")).resolves.not.toThrow();
		});
	});

	describe("state management", () => {
		it("should save and restore state", async () => {
			const actor = StubActor.withLabels({ danger: 0 });
			actor.save();

			await actor.update({ "system.stats.danger.value": 3 });
			expect(actor.system.stats.danger.value).toBe(3);

			actor.reset();
			expect(actor.system.stats.danger.value).toBe(0);
		});

		it("should clone actors", () => {
			const original = StubActor.withLabels({ danger: 2 });
			const clone = original.clone();

			clone.setLabel("danger", 3);

			expect(original.system.stats.danger.value).toBe(2);
			expect(clone.system.stats.danger.value).toBe(3);
		});
	});

	describe("helper methods", () => {
		it("should set and get labels", () => {
			const actor = StubActor.forCharacter();

			actor.setLabel("danger", 2).setLabel("freak", -1);

			expect(actor.getLabel("danger")).toBe(2);
			expect(actor.getLabel("freak")).toBe(-1);
		});

		it("should set conditions", () => {
			const actor = StubActor.forCharacter();

			actor.setCondition("afraid", true).setCondition("angry", true);

			expect(actor.system.attributes.conditions.options[0].value).toBe(true);
			expect(actor.system.attributes.conditions.options[1].value).toBe(true);
			expect(actor.system.attributes.conditions.options[2].value).toBe(false);
		});
	});
});

describe("StubNotificationService", () => {
	let notifications: StubNotificationService;

	beforeEach(() => {
		notifications = new StubNotificationService();
	});

	it("should track notification calls", () => {
		notifications.warn("Something happened");
		notifications.error("Critical failure");

		expect(notifications.wasCalled("warn")).toBe(true);
		expect(notifications.wasCalled("error")).toBe(true);
		expect(notifications.wasCalled("info")).toBe(false);
	});

	it("should check for notification patterns", () => {
		notifications.warn("No valid label shifts available");

		expect(notifications.hasNotification("warn", "label shifts")).toBe(true);
		expect(notifications.hasNotification("warn", /label\s+shifts/)).toBe(true);
		expect(notifications.hasNotification("error", "label shifts")).toBe(false);
	});
});

describe("StubSettings", () => {
	let settings: StubSettings;

	beforeEach(() => {
		settings = new StubSettings();
	});

	it("should register and retrieve settings", async () => {
		settings.register("masks-newgeneration-unofficial", "darkMode", {
			default: false,
			type: Boolean,
		});

		expect(settings.get("masks-newgeneration-unofficial", "darkMode")).toBe(false);

		await settings.set("masks-newgeneration-unofficial", "darkMode", true);
		expect(settings.get("masks-newgeneration-unofficial", "darkMode")).toBe(true);
	});

	it("should poison setting access", () => {
		settings.poison("masks-newgeneration-unofficial.darkMode", new Error("Storage error"));

		expect(() =>
			settings.get("masks-newgeneration-unofficial", "darkMode"),
		).toThrow("Storage error");
	});
});

describe("StubHooks", () => {
	let hooks: StubHooks;

	beforeEach(() => {
		hooks = new StubHooks();
	});

	it("should register and call hooks", () => {
		const callback = jest.fn();
		hooks.on("ready", callback);

		hooks.callAll("ready");

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("should handle once hooks", () => {
		const callback = jest.fn();
		hooks.once("init", callback);

		hooks.callAll("init");
		hooks.callAll("init");

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it("should track hook registrations", () => {
		hooks.on("renderActorSheet", () => {});
		hooks.on("renderActorSheet", () => {});

		expect(hooks.hasCallbacks("renderActorSheet")).toBe(true);
		expect(hooks.getCallbackCount("renderActorSheet")).toBe(2);
	});
});

describe("StubActorCollection", () => {
	let collection: StubActorCollection;

	beforeEach(() => {
		collection = new StubActorCollection();
	});

	it("should add and retrieve actors", () => {
		const actor = StubActor.forCharacter({ id: "char-001", name: "Beacon" });
		collection.add(actor);

		expect(collection.get("char-001")).toBe(actor);
		expect(collection.getName("Beacon")).toBe(actor);
	});

	it("should filter actors by type", () => {
		collection.add(StubActor.forCharacter({ name: "Hero" }));
		collection.add(StubActor.forNPC({ name: "Villain" }));

		expect(collection.getCharacters()).toHaveLength(1);
		expect(collection.getNPCs()).toHaveLength(1);
	});
});

describe("Pre-built Test Characters", () => {
	it("should have correct label values for BEACON", () => {
		expect(BEACON.name).toBe("Beacon");
		expect(BEACON.getLabel("danger")).toBe(2);
		expect(BEACON.getLabel("superior")).toBe(-1);
	});

	it("should have 6th label for SOLDIER", () => {
		expect(SOLDIER.system.playbook.name).toBe("The Soldier");
		expect(SOLDIER.system.attributes.theSoldier).toBeDefined();
	});

	it("should have edge case character at bounds", () => {
		expect(EDGE_CASE_MAX_DANGER.getLabel("danger")).toBe(3);
		expect(EDGE_CASE_MAX_DANGER.getLabel("freak")).toBe(-2);
	});

	it("should have NPC with stats", () => {
		expect(SIPHON.type).toBe("npc");
		expect(SIPHON.name).toBe("Siphon");
	});

	it("should create standard scenario", () => {
		const { pc1, pc2, villain } = createStandardScenario();

		expect(pc1.type).toBe("character");
		expect(pc2.type).toBe("character");
		expect(villain.type).toBe("npc");
	});

	it("should clone test characters for mutation safety", () => {
		const clone = BEACON.clone();
		clone.setLabel("danger", 0);

		expect(BEACON.getLabel("danger")).toBe(2); // Original unchanged
		expect(clone.getLabel("danger")).toBe(0);
	});
});
