import { createLabelsGraphData } from "../labels-graph.mjs";

export function MasksActorSheetMixin(Base) {
	return class MasksActorSheet extends Base {
		/** @override */
		get template() {
			return 'modules/masks-newgeneration-unofficial/templates/sheets/actor-sheet.hbs';
		}

		/** @override */
		async getData() {
			const context = await super.getData();

			// Add labels graph data for character sheets
			if (this.actor?.type === "character") {
				context.labelsGraph = createLabelsGraphData(this.actor, {
					size: 80,
					borderWidth: 2,
					showInnerLines: true,
					showVertexDots: false,
				});
			}

			return context;
		}
	}
}