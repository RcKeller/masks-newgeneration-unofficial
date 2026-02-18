/**
 * Tests for FoundryVTT v13+ API deprecation fixes
 * Verifies that the module uses the correct modern APIs
 */

describe("FoundryVTT v13+ API compatibility", () => {
	describe("CHAT_MESSAGE_STYLES", () => {
		it("should have CHAT_MESSAGE_STYLES defined (replaces deprecated CHAT_MESSAGE_TYPES)", () => {
			expect(CONST.CHAT_MESSAGE_STYLES).toBeDefined();
		});

		it("should have OTHER style defined", () => {
			expect(CONST.CHAT_MESSAGE_STYLES.OTHER).toBe(0);
		});

		it("should have OOC style defined", () => {
			expect(CONST.CHAT_MESSAGE_STYLES.OOC).toBe(1);
		});

		it("should have IC style defined", () => {
			expect(CONST.CHAT_MESSAGE_STYLES.IC).toBe(2);
		});

		it("should have EMOTE style defined", () => {
			expect(CONST.CHAT_MESSAGE_STYLES.EMOTE).toBe(3);
		});
	});

	describe("DialogV2", () => {
		it("should have DialogV2 available under foundry.applications.api", () => {
			expect(foundry.applications).toBeDefined();
			expect(foundry.applications.api).toBeDefined();
			expect(foundry.applications.api.DialogV2).toBeDefined();
		});

		it("should have wait method for multi-button dialogs", () => {
			expect(typeof foundry.applications.api.DialogV2.wait).toBe("function");
		});

		it("should have confirm method for yes/no dialogs", () => {
			expect(typeof foundry.applications.api.DialogV2.confirm).toBe("function");
		});

		it("should have prompt method for single-button dialogs", () => {
			expect(typeof foundry.applications.api.DialogV2.prompt).toBe("function");
		});

		it("should call default button callback when wait is invoked", async () => {
			const mockCallback = jest.fn().mockReturnValue({ result: "test" });
			const result = await foundry.applications.api.DialogV2.wait({
				content: "<form></form>",
				buttons: [
					{
						action: "ok",
						label: "OK",
						default: true,
						callback: mockCallback,
					},
				],
			});

			expect(mockCallback).toHaveBeenCalled();
			expect(result).toEqual({ result: "test" });
		});
	});

	describe("TextEditor.implementation", () => {
		it("should have TextEditor.implementation available under foundry.applications.ux", () => {
			expect(foundry.applications).toBeDefined();
			expect(foundry.applications.ux).toBeDefined();
			expect(foundry.applications.ux.TextEditor).toBeDefined();
			expect(foundry.applications.ux.TextEditor.implementation).toBeDefined();
		});

		it("should have enrichHTML method", () => {
			expect(typeof foundry.applications.ux.TextEditor.implementation.enrichHTML).toBe("function");
		});

		it("should return enriched HTML content", async () => {
			const content = "<p>Test content</p>";
			const result = await foundry.applications.ux.TextEditor.implementation.enrichHTML(content);
			// Mock returns content unchanged
			expect(result).toBe(content);
		});
	});

	describe("renderTemplate", () => {
		it("should have renderTemplate available under foundry.applications.handlebars", () => {
			expect(foundry.applications.handlebars).toBeDefined();
			expect(typeof foundry.applications.handlebars.renderTemplate).toBe("function");
		});

		it("should render a template with data", async () => {
			const result = await foundry.applications.handlebars.renderTemplate(
				"templates/test.hbs",
				{ name: "Test" }
			);
			expect(result).toContain("templates/test.hbs");
		});
	});
});
