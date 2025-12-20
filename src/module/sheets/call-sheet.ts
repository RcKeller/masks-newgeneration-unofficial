// module/sheets/call-sheet.ts
// Call Actor Sheet - Dispatch-style vignette assignment UI
// Combines Masks labels with Dispatch's fit-check mechanic

import {
	createOverlayGraphData,
	updateOverlayGraphAnimated,
	checkFitResult,
	type CallRequirements,
	type FitResult,
} from "../labels-graph-overlay";
import { extractLabelsData, LABEL_ORDER, GRAPH_PRESETS } from "../labels-graph";
import { CooldownSystem, getTeamCombatants, getActiveCombat, isDowned } from "../turn-cards";
import { HookRegistry } from "../helpers/hook-registry";

const NS = "masks-newgeneration-unofficial";
const TEMPLATE = `modules/${NS}/templates/sheets/call-sheet.hbs`;

// Forward bounds (from turn-cards.ts)
const FORWARD_MIN = -1;
const FORWARD_MAX = 8;

/**
 * Call types (enum keywords inspired by Dispatch)
 */
export const CALL_TYPES = Object.freeze({
	assault: { key: "assault", label: "DISPATCH.Call.Types.assault", icon: "fa-solid fa-fist-raised" },
	rescue: { key: "rescue", label: "DISPATCH.Call.Types.rescue", icon: "fa-solid fa-life-ring" },
	investigation: { key: "investigation", label: "DISPATCH.Call.Types.investigation", icon: "fa-solid fa-magnifying-glass" },
	social: { key: "social", label: "DISPATCH.Call.Types.social", icon: "fa-solid fa-comments" },
	disaster: { key: "disaster", label: "DISPATCH.Call.Types.disaster", icon: "fa-solid fa-house-crack" },
});

/**
 * Dispatch status states
 */
export type DispatchStatus = "idle" | "assessing" | "qualified";

/**
 * Call sheet for the "Call" actor type
 * Top section is visible to all players
 * Bottom section is GM/owner-only
 */
export class CallSheet extends ActorSheet {
	/** @override */
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["masks", "sheet", "call-sheet"],
			template: TEMPLATE,
			width: 900,
			height: 700,
			resizable: true,
			tabs: [],
			// Allow limited and observer users to interact with the sheet
			viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
			// Ensure all users can see sheet updates
			submitOnChange: false,
		});
	}

	/** Track hovered actor for preview (from turn cards) */
	_hoveredActorId: string | null = null;

	/** Track previous graph state for animation */
	_previousGraphState: { heroPath: string; reqPath: string; overlapPath?: string } | null = null;

	/** Hook registry for proper cleanup */
	_hooks: HookRegistry | null = null;

	/** Debounce timer for requirement changes */
	_requirementDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	/** Cached hero labels for partial updates */
	_cachedHeroLabels: Record<string, number> | null = null;

	/** Cached requirements for partial updates */
	_cachedRequirements: CallRequirements | null = null;

	/** @override */
	get title() {
		const callType = this.actor.getFlag(NS, "callType") ?? "assault";
		const typeConfig = CALL_TYPES[callType as keyof typeof CALL_TYPES];
		const typeName = game.i18n?.localize?.(typeConfig?.label ?? "DISPATCH.Call.Types.assault") ?? "Call";
		return `${typeName}: ${this.actor.name}`;
	}

	/**
	 * Override isEditable to allow Limited users to interact with form elements.
	 * Individual fields are controlled by canEdit in the template.
	 * Hero selection and dispatch are available to all viewers.
	 * @override
	 */
	get isEditable(): boolean {
		// Allow interaction for anyone who can view the sheet
		// The template uses canEdit to restrict editing of metadata
		return true;
	}

	/** @override */
	async getData() {
		const context = await super.getData();
		const isOwner = this.actor.isOwner;
		const isGM = game.user?.isGM ?? false;
		// Anyone who can see the sheet can interact (select hero, dispatch)
		// Limited, Observer, and Owner all can interact - only editing metadata is restricted
		const hasLimitedPermission = this.actor.testUserPermission(game.user!, "LIMITED");
		const hasObserverPermission = this.actor.testUserPermission(game.user!, "OBSERVER");
		const canEdit = isOwner || isGM;
		// Everyone who can view the sheet can interact with hero selection and dispatch
		const canInteract = true; // All viewers can select hero and dispatch

		// Call metadata
		const callType = this.actor.getFlag(NS, "callType") ?? "assault";
		const callerName = this.actor.getFlag(NS, "callerName") ?? "";
		const callerQuote = this.actor.getFlag(NS, "callerQuote") ?? "";
		const requirementsText = this.actor.getFlag(NS, "requirementsText") ?? "";

		// Requirements (label thresholds 1-3 or null)
		const requirements: CallRequirements = this.actor.getFlag(NS, "requirements") ?? {};

		// Assigned hero(es) - array of actor IDs
		const assignedActorIds: string[] = this.actor.getFlag(NS, "assignedActorIds") ?? [];

		// Dispatch state
		const dispatchStatus: DispatchStatus = this.actor.getFlag(NS, "dispatchStatus") ?? "idle";
		const fitResult: FitResult = this.actor.getFlag(NS, "fitResult") ?? null;
		const forwardChange: number | null = this.actor.getFlag(NS, "forwardChange") ?? null;
		// Snapshotted hero labels from dispatch time (for qualified calls)
		const snapshotHeroLabels: Record<string, number> | null = this.actor.getFlag(NS, "snapshotHeroLabels") ?? null;

		// Get assigned actor (first one for now, multi-select future)
		let assignedActor: Actor | null = null;
		let previewActor: Actor | null = null;

		if (assignedActorIds.length > 0) {
			assignedActor = game.actors?.get(assignedActorIds[0]) ?? null;
		}

		// Hover preview takes precedence
		if (this._hoveredActorId) {
			previewActor = game.actors?.get(this._hoveredActorId) ?? null;
		}

		// Use hovered > assigned for preview
		const graphActor = previewActor ?? assignedActor;

		// Extract hero data for preview fit calculation
		const heroData = graphActor ? extractLabelsData(graphActor) : null;

		// Only show requirements overlay to players AFTER dispatch (or always to GM)
		const showRequirementsOverlay = isGM || dispatchStatus === "qualified";

		// Create overlay graph data
		// Pass empty requirements to players until dispatch is complete
		// Snapshot is the definitive source of truth when it exists - the overlay
		// function will use it if present, otherwise fall back to live actor data
		const overlayGraph = createOverlayGraphData(
			graphActor,
			showRequirementsOverlay ? requirements : {},
			{
				size: 280,
				borderWidth: 2.5,
				showInnerLines: true,
				showIcons: true,
				showSpokeDots: true,
				isAssessed: dispatchStatus === "qualified",
			},
			snapshotHeroLabels
		);

		// Prepare call types for select
		const callTypeOptions = Object.entries(CALL_TYPES).map(([key, config]) => ({
			key,
			label: game.i18n?.localize?.(config.label) ?? key,
			icon: config.icon,
			selected: key === callType,
		}));

		// Get current call type config
		const currentTypeConfig = CALL_TYPES[callType as keyof typeof CALL_TYPES] ?? CALL_TYPES.assault;

		// Prepare label rows for requirements editing (GM only)
		const labelRows = LABEL_ORDER.map((key) => {
			const req = requirements[key as keyof CallRequirements];
			const heroValue = overlayGraph.heroLabels?.[key] ?? null;
			const hasHeroValue = heroValue !== null;
			// hasRequirement is true if req is a number (including 0 and negative)
			const hasRequirement = req != null;
			const diff = hasHeroValue && hasRequirement ? heroValue - req : null;
			// Undefined/null requirement is treated as -9 (always met since hero range is -3 to +4)
			const met = !hasRequirement || (hasHeroValue && heroValue >= req);

			return {
				key,
				label: game.i18n?.localize?.(`DISPATCH.CharacterSheets.stats.${key}`) ?? key,
				requirement: req,
				hasRequirement, // True if requirement is set (number), false if undefined/null
				heroValue,
				hasHeroValue, // Separate flag to check for null vs 0
				diff,
				met,
			};
		});

		// Get active combat and team combatants for hero filtering
		const activeCombat = getActiveCombat();
		const teamCombatants = activeCombat ? getTeamCombatants(activeCombat) : [];
		const teamSize = teamCombatants.length;
		const maxCd = CooldownSystem.maxCooldown(teamSize);

		// Build map of actor ID -> combatant for cooldown lookup
		const combatantByActorId = new Map(
			teamCombatants.map((c) => [c.actorId, c])
		);

		// REQUIRE active combat for hero selection
		// Filter to only available heroes (in combat + not on cooldown)
		let characterActors: { id: string | null; name: string | null; selected: boolean; cooldownRemaining?: number }[] = [];
		let noCombatWarning = false;

		if (!activeCombat) {
			// No active combat - show warning, no heroes available
			noCombatWarning = true;
			characterActors = [];
		} else {
			// Filter team combatants: exclude downed and on-cooldown heroes
			characterActors = teamCombatants
				.filter((cbt) => !isDowned(cbt) && !CooldownSystem.isOnCooldown(cbt, maxCd))
				.map((cbt) => ({
					id: cbt.actorId,
					name: cbt.actor?.name ?? "Unknown",
					selected: assignedActorIds.includes(cbt.actorId ?? ""),
					cooldownRemaining: CooldownSystem.remaining(cbt, maxCd),
				}));
		}

		// Dispatch button states - Limited permission can also dispatch
		const canDispatch = assignedActor !== null && dispatchStatus === "idle" && canInteract;
		const isAssessing = dispatchStatus === "assessing";
		const isQualified = dispatchStatus === "qualified";

		// Fit result styling
		let fitClass = "";
		let fitLabel = "";
		if (isQualified && fitResult) {
			switch (fitResult) {
				case "great":
					fitClass = "fit--great";
					fitLabel = game.i18n?.localize?.("DISPATCH.Call.Fit.great") ?? "Great Fit";
					break;
				case "good":
					fitClass = "fit--decent";
					fitLabel = game.i18n?.localize?.("DISPATCH.Call.Fit.good") ?? "Good Fit";
					break;
				case "poor":
					fitClass = "fit--poor";
					fitLabel = game.i18n?.localize?.("DISPATCH.Call.Fit.poor") ?? "Poor Fit";
					break;
			}
		}

		// Preview fit indicator (dynamic, not a button) - only for GM
		let previewFitClass = "";
		let previewFitLabel = "";
		if (isGM && !isQualified && graphActor && heroData) {
			const previewFit = checkFitResult(heroData.labels, requirements);
			switch (previewFit) {
				case "great":
					previewFitClass = "preview-fit--great";
					previewFitLabel = "Great Fit";
					break;
				case "good":
					previewFitClass = "preview-fit--decent";
					previewFitLabel = "Decent Fit";
					break;
				case "poor":
					previewFitClass = "preview-fit--poor";
					previewFitLabel = "Poor Fit";
					break;
			}
		}

		// Forward change message
		let forwardMessage = "";
		if (forwardChange !== null && assignedActor) {
			const sign = forwardChange > 0 ? "+" : "";
			forwardMessage = `${assignedActor.name} takes ${sign}${forwardChange} Forward`;
		}

		// Cache hero labels and requirements for partial updates
		this._cachedHeroLabels = overlayGraph.heroLabels;
		this._cachedRequirements = requirements;

		return {
			...context,
			// Permissions
			isOwner,
			isGM,
			canEdit,
			canInteract,
			canSeeBottom: isGM, // GM only section (stats hidden from players)

			// Call metadata
			callType,
			callTypeOptions,
			currentTypeIcon: currentTypeConfig.icon,
			callerName,
			callerQuote,
			requirementsText,

			// Graph
			overlayGraph,

			// Assignment
			assignedActorIds,
			assignedActor,
			previewActor,
			characterActors,
			noCombatWarning,

			// Dispatch state
			dispatchStatus,
			canDispatch,
			isAssessing,
			isQualified,
			fitResult,
			fitClass,
			fitLabel,
			forwardChange,
			forwardMessage,

			// Preview fit indicator (dynamic)
			previewFitClass,
			previewFitLabel,

			// Requirements editing (GM only)
			labelRows,
			requirements,
		};
	}

	/** @override */
	activateListeners(html: JQuery) {
		super.activateListeners(html);

		// Call type select
		html.on("change", "[data-action='change-call-type']", this._onChangeCallType.bind(this));

		// Text field changes
		html.on("change", "[data-action='change-caller-name']", this._onChangeCallerName.bind(this));
		html.on("change", "[data-action='change-caller-quote']", this._onChangeCallerQuote.bind(this));
		html.on("change", "[data-action='change-requirements-text']", this._onChangeRequirementsText.bind(this));

		// Requirement value changes
		html.on("change", "[data-action='change-requirement']", this._onChangeRequirement.bind(this));

		// Assignment
		html.on("change", "[data-action='assign-hero']", this._onAssignHero.bind(this));

		// View hero button
		html.on("click", "[data-action='view-hero']", this._onViewHero.bind(this));

		// Dispatch button
		html.on("click", "[data-action='dispatch']", this._onDispatch.bind(this));

		// Reset button (GM only)
		html.on("click", "[data-action='reset-call']", this._onResetCall.bind(this));

		// Reveal button (GM only - shows pass/fail preview)
		html.on("click", "[data-action='reveal-fit']", this._onRevealFit.bind(this));

		// Register for hover events from turn cards
		this._registerHoverListener();

		// Register for actor updates (to update graph when assigned hero's labels change)
		this._registerActorUpdateListener();
	}

	/** @override */
	async close(options?: Application.CloseOptions) {
		// Cleanup all hooks via registry
		if (this._hooks) {
			this._hooks.unregisterAll();
			this._hooks = null;
		}
		return super.close(options);
	}

	/**
	 * Register listeners using HookRegistry for proper cleanup
	 */
	_registerHoverListener() {
		if (!this._hooks) {
			this._hooks = new HookRegistry();
		}

		// Register hover listener
		this._hooks.on("masksCallHoverActor", (actorId: unknown) => {
			this._onHoverActor(actorId as string | null);
		});
	}

	/**
	 * Unregister hover listener (now handled by HookRegistry)
	 */
	_unregisterHoverListener() {
		// Handled by close() via HookRegistry.unregisterAll()
	}

	/**
	 * Handle actor hover from turn cards
	 * Uses partial update for smooth animation without full re-render
	 */
	_onHoverActor(actorId: string | null) {
		if (this._hoveredActorId === actorId) return;
		this._hoveredActorId = actorId;

		// Try partial update first for smooth animation
		if (!this._updateGraphInPlace('hero')) {
			// Fallback to full render if partial update failed
			this.render(false);
		}
	}

	/**
	 * Register listener for actor updates (to update graph when assigned hero's labels change)
	 * Uses partial update for smooth animation without full re-render
	 */
	_registerActorUpdateListener() {
		if (!this._hooks) {
			this._hooks = new HookRegistry();
		}

		// Register actor update listener with early filtering
		this._hooks.on("updateActor", (actor: unknown, changes: unknown, _options: unknown, _userId: unknown) => {
			const a = actor as Actor;
			const c = changes as object;

			// Check if the updated actor is our assigned hero
			const assignedActorIds: string[] = this.actor.getFlag(NS, "assignedActorIds") ?? [];
			if (!assignedActorIds.includes(a.id ?? "")) return;

			// Skip updates during dispatch process - the graph should remain frozen
			// until dispatch completes and the snapshot is saved
			const dispatchStatus: DispatchStatus = this.actor.getFlag(NS, "dispatchStatus") ?? "idle";
			if (dispatchStatus === "assessing") return;

			// Check if stats/labels/conditions changed
			if (foundry.utils.hasProperty(c, "system.stats") ||
				foundry.utils.hasProperty(c, "system.resources") ||
				foundry.utils.hasProperty(c, "system.attributes.conditions") ||
				foundry.utils.hasProperty(c, "flags")) {
				// Try partial update first for smooth animation
				if (!this._updateGraphInPlace('hero')) {
					// Fallback to full render if partial update failed
					this.render(false);
				}
			}
		});
	}

	/**
	 * Unregister actor update listener (now handled by HookRegistry)
	 */
	_unregisterActorUpdateListener() {
		// Handled by close() via HookRegistry.unregisterAll()
	}

	/**
	 * Handle call type change
	 */
	async _onChangeCallType(event: JQuery.ChangeEvent) {
		const select = event.currentTarget as HTMLSelectElement;
		await this.actor.setFlag(NS, "callType", select.value);
	}

	/**
	 * Handle caller name change
	 */
	async _onChangeCallerName(event: JQuery.ChangeEvent) {
		const input = event.currentTarget as HTMLInputElement;
		await this.actor.setFlag(NS, "callerName", input.value);
	}

	/**
	 * Handle caller quote change
	 */
	async _onChangeCallerQuote(event: JQuery.ChangeEvent) {
		const input = event.currentTarget as HTMLTextAreaElement;
		await this.actor.setFlag(NS, "callerQuote", input.value);
	}

	/**
	 * Handle requirements text change
	 */
	async _onChangeRequirementsText(event: JQuery.ChangeEvent) {
		const input = event.currentTarget as HTMLTextAreaElement;
		await this.actor.setFlag(NS, "requirementsText", input.value);
	}

	/**
	 * Handle requirement value change
	 * Empty string = clear the requirement (undefined, treated as -9 for comparison)
	 * -3 to 4 = set the requirement
	 *
	 * Uses debounced handler for smooth graph animation without full re-render
	 */
	async _onChangeRequirement(event: JQuery.ChangeEvent) {
		const input = event.currentTarget as HTMLInputElement;
		const labelKey = input.dataset.label;
		if (!labelKey) return;

		const value = input.value.trim();
		const parsed = parseInt(value, 10);

		// Empty string or NaN = clear the requirement (undefined)
		// Otherwise clamp to -3 to 4 range
		const numValue = (value === "" || isNaN(parsed)) ? null : Math.max(-3, Math.min(4, parsed));

		// Use debounced handler for smooth animation
		await this._updateRequirementsDebounced(labelKey, numValue);
	}

	/**
	 * Handle hero assignment change
	 * Uses GM query if user doesn't have ownership
	 */
	async _onAssignHero(event: JQuery.ChangeEvent) {
		const select = event.currentTarget as HTMLSelectElement;
		const actorId = select.value;
		const assignedActorIds = actorId ? [actorId] : [];

		// If user has ownership, update directly
		if (this.actor.isOwner) {
			await this.actor.setFlag(NS, "assignedActorIds", assignedActorIds);
			return;
		}

		// Otherwise, request GM to make the change via query
		await queryGM("assignHero", { callActorId: this.actor.id, assignedActorIds });
	}

	/**
	 * Handle view hero button click
	 * Opens the character sheet of the assigned hero
	 */
	_onViewHero(event: JQuery.ClickEvent) {
		event.preventDefault();

		const assignedActorIds: string[] = this.actor.getFlag(NS, "assignedActorIds") ?? [];
		if (assignedActorIds.length === 0) return;

		const assignedActor = game.actors?.get(assignedActorIds[0]);
		if (!assignedActor) return;

		// Open the actor's sheet
		assignedActor.sheet?.render(true);
	}

	/**
	 * Handle dispatch button click
	 * Uses GM query if user doesn't have ownership
	 */
	async _onDispatch(event: JQuery.ClickEvent) {
		event.preventDefault();

		const assignedActorIds: string[] = this.actor.getFlag(NS, "assignedActorIds") ?? [];
		if (assignedActorIds.length === 0) {
			ui.notifications?.warn?.("Assign a hero first.");
			return;
		}

		const assignedActor = game.actors?.get(assignedActorIds[0]);
		if (!assignedActor) {
			ui.notifications?.warn?.("Assigned hero not found.");
			return;
		}

		// If user has ownership, execute directly
		if (this.actor.isOwner) {
			await executeDispatch(this.actor, assignedActor);
			return;
		}

		// Otherwise, request GM to execute via query
		await queryGM("dispatch", { callActorId: this.actor.id });
	}

	/**
	 * Handle reset button click (GM only)
	 * Resets dispatch state and clears assigned hero - requirements are preserved
	 */
	async _onResetCall(event: JQuery.ClickEvent) {
		event.preventDefault();

		if (!game.user?.isGM) {
			ui.notifications?.warn?.("Only GM can reset calls.");
			return;
		}

		// Clear previous graph state to ensure clean animation
		this._previousGraphState = null;

		// Reset all dispatch state atomically to prevent intermediate re-renders
		// with inconsistent state (e.g., snapshot cleared before status reset)
		// Note: requirements are preserved - only dispatch state is cleared
		await this.actor.update({
			[`flags.${NS}.dispatchStatus`]: "idle",
			[`flags.${NS}.fitResult`]: null,
			[`flags.${NS}.forwardChange`]: null,
			[`flags.${NS}.assignedActorIds`]: [],
			[`flags.${NS}.snapshotHeroLabels`]: null,
		});
	}

	/**
	 * Handle reveal button click (GM only - preview fit without dispatching)
	 * Now just triggers a re-render to show the preview fit indicator dynamically
	 */
	async _onRevealFit(event: JQuery.ClickEvent) {
		event.preventDefault();
		// The preview fit is now shown dynamically in the template
		// This button can be removed or just trigger a re-render
		this.render(false);
	}

	/** @override */
	async _render(force?: boolean, options?: RenderOptions) {
		// Save graph state for animation
		const oldHeroPath = this.element?.[0]?.querySelector(".labels-graph-overlay-hero")?.getAttribute("d") ?? null;
		const oldReqPath = this.element?.[0]?.querySelector(".labels-graph-overlay-requirements")?.getAttribute("d") ?? null;

		if (oldHeroPath || oldReqPath) {
			this._previousGraphState = {
				heroPath: oldHeroPath ?? "",
				reqPath: oldReqPath ?? "",
			};
		}

		await super._render(force, options);

		// Animate graph transition
		this._animateGraphTransition();
	}

	/**
	 * Animate the overlay graph from previous state to new state
	 */
	_animateGraphTransition() {
		const prev = this._previousGraphState;
		if (!prev) return;

		const heroPath = this.element?.[0]?.querySelector(".labels-graph-overlay-hero") as SVGPathElement | null;
		const reqPath = this.element?.[0]?.querySelector(".labels-graph-overlay-requirements") as SVGPathElement | null;

		// Animate hero path if it exists and changed
		if (heroPath && prev.heroPath) {
			const newPath = heroPath.getAttribute("d");
			if (newPath && prev.heroPath !== newPath) {
				heroPath.style.transition = "none";
				heroPath.setAttribute("d", prev.heroPath);
				void heroPath.getBoundingClientRect();
				heroPath.style.transition = "d 0.4s cubic-bezier(0.4, 0, 0.2, 1), fill 0.3s ease, stroke 0.3s ease";
				heroPath.setAttribute("d", newPath);
			}
		}

		// Animate requirements path if changed
		if (reqPath && prev.reqPath) {
			const newPath = reqPath.getAttribute("d");
			if (newPath && prev.reqPath !== newPath) {
				reqPath.style.transition = "none";
				reqPath.setAttribute("d", prev.reqPath);
				void reqPath.getBoundingClientRect();
				reqPath.style.transition = "d 0.4s cubic-bezier(0.4, 0, 0.2, 1), fill 0.3s ease, stroke 0.3s ease";
				reqPath.setAttribute("d", newPath);
			}
		}

		this._previousGraphState = null;
	}

	/**
	 * Update the overlay graph in-place without full re-render
	 * This is used for smooth animations when hero or requirements change
	 *
	 * @param changes - What changed: 'hero', 'requirements', or 'all'
	 * @returns true if partial update succeeded, false if full re-render needed
	 */
	_updateGraphInPlace(changes: 'hero' | 'requirements' | 'all'): boolean {
		const container = this.element?.[0]?.querySelector('.call-sheet__graph') as HTMLElement | null;
		if (!container) return false;

		// Get current state
		const dispatchStatus: DispatchStatus = this.actor.getFlag(NS, "dispatchStatus") ?? "idle";
		const isGM = game.user?.isGM ?? false;
		const isAssessed = dispatchStatus === "qualified";
		const showRequirementsOverlay = isGM || isAssessed;

		// Get requirements (use cached or fetch fresh)
		const requirements: CallRequirements = this._cachedRequirements ?? this.actor.getFlag(NS, "requirements") ?? {};

		// Get hero labels (for changes = 'hero' or 'all')
		let heroLabels: Record<string, number> | null = null;
		if (changes === 'hero' || changes === 'all') {
			// Snapshot is the definitive source of truth when it exists
			// This prevents flashes during dispatch/reset transitions
			const snapshotLabels: Record<string, number> | null = this.actor.getFlag(NS, "snapshotHeroLabels") ?? null;

			if (snapshotLabels) {
				heroLabels = snapshotLabels;
			} else {
				// No snapshot - extract live data from actor
				const assignedActorIds: string[] = this.actor.getFlag(NS, "assignedActorIds") ?? [];
				const assignedActor = assignedActorIds.length > 0 ? game.actors?.get(assignedActorIds[0]) : null;
				const hoveredActor = this._hoveredActorId ? game.actors?.get(this._hoveredActorId) : null;
				const graphActor = hoveredActor ?? assignedActor;

				if (graphActor) {
					const data = extractLabelsData(graphActor);
					heroLabels = data?.labels ?? null;
				}
			}

			// Update cache
			this._cachedHeroLabels = heroLabels;
		} else {
			// Use cached labels
			heroLabels = this._cachedHeroLabels;
		}

		// Call the overlay update function
		const success = updateOverlayGraphAnimated(
			container,
			heroLabels,
			showRequirementsOverlay ? requirements : {},
			{
				size: GRAPH_PRESETS.callSheet.size,
				showIcons: GRAPH_PRESETS.callSheet.showIcons,
				isAssessed,
			}
		);

		// Update tooltip
		if (success && heroLabels) {
			const tooltipParts: string[] = [];
			for (const key of LABEL_ORDER) {
				const hero = heroLabels[key] ?? 0;
				tooltipParts.push(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${hero}`);
			}
			container.setAttribute('data-tooltip', tooltipParts.join(' | '));
		}

		return success;
	}

	/**
	 * Debounced requirement change handler for smooth graph updates
	 */
	async _updateRequirementsDebounced(labelKey: string, value: number | null) {
		// Clear any pending debounce
		if (this._requirementDebounceTimer) {
			clearTimeout(this._requirementDebounceTimer);
		}

		// Update cached requirements immediately for smooth animation
		if (!this._cachedRequirements) {
			this._cachedRequirements = { ...this.actor.getFlag(NS, "requirements") ?? {} };
		}

		if (value !== null) {
			this._cachedRequirements[labelKey as keyof CallRequirements] = value;
		} else {
			delete this._cachedRequirements[labelKey as keyof CallRequirements];
		}

		// Animate graph immediately using cached value
		this._updateGraphInPlace('requirements');

		// Debounce the actual flag update
		this._requirementDebounceTimer = setTimeout(async () => {
			// Build new requirements object
			const newRequirements: Record<string, number> = {};
			for (const key of LABEL_ORDER) {
				const val = this._cachedRequirements?.[key as keyof CallRequirements];
				if (val != null) {
					newRequirements[key] = val;
				}
			}

			// Update the flag (will trigger a render, but graph is already animated)
			await this.actor.unsetFlag(NS, "requirements");
			if (Object.keys(newRequirements).length > 0) {
				await this.actor.setFlag(NS, "requirements", newRequirements);
			}
		}, 150);
	}
}

/**
 * Set hovered actor from turn cards (for all open call sheets)
 */
export function setCallSheetHoveredActor(actorId: string | null) {
	Hooks.callAll("masksCallHoverActor", actorId);
}

// ────────────────────────────────────────────────────────────────────────────
// GM Query Handlers for Limited Permission Users (V13+ Query System)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Execute the dispatch logic (extracted for reuse by both owner and GM proxy)
 * - Calculates fit result
 * - Snapshots hero labels at dispatch time
 * - Applies forward change to hero
 * - Applies cooldown to hero in active combat
 * - Posts chat message with result
 */
async function executeDispatch(callActor: Actor, assignedActor: Actor): Promise<{ success: boolean }> {
	await callActor.setFlag(NS, "dispatchStatus", "assessing");
	await new Promise((r) => setTimeout(r, 800));

	const heroData = extractLabelsData(assignedActor);
	if (!heroData) {
		await callActor.setFlag(NS, "dispatchStatus", "idle");
		return { success: false };
	}

	const requirements: CallRequirements = callActor.getFlag(NS, "requirements") ?? {};
	const fitResult = checkFitResult(heroData.labels, requirements);

	// Snapshot the hero's labels at dispatch time (BEFORE forward change)
	// This preserves the stats used to evaluate the fit for display purposes
	const snapshotHeroLabels = { ...heroData.labels };

	// Only set forwardChange for great (+1) or poor (-1) fits; null = no change
	const forwardChange: number | null = fitResult === "great" ? 1 : fitResult === "poor" ? -1 : null;

	if (forwardChange !== null) {
		const cur = Number(foundry.utils.getProperty(assignedActor, "system.resources.forward.value")) || 0;
		const next = Math.max(FORWARD_MIN, Math.min(FORWARD_MAX, cur + forwardChange));
		if (next !== cur) await assignedActor.update({ "system.resources.forward.value": next });
	}

	// Apply cooldown to the dispatched hero (GM only)
	const combat = getActiveCombat();
	if (combat && game.user?.isGM) {
		const teamCombatants = getTeamCombatants(combat);
		const heroCombatant = teamCombatants.find((c) => c.actorId === assignedActor.id);
		if (heroCombatant) {
			await CooldownSystem.gmApplyTurn(combat, heroCombatant.id);
		}
	}

	const fitName = fitResult === "great" ? "great fit" : fitResult === "good" ? "decent fit" : "poor fit";
	const fitCss = fitResult === "good" ? "decent" : fitResult;
	const fwdTxt = forwardChange
		? ` <span class="forward-change forward-change--${forwardChange > 0 ? "positive" : "negative"}">${forwardChange > 0 ? "+" : ""}${forwardChange} Forward</span>`
		: "";

	await ChatMessage.create({
		content: `<div class="call-dispatch-result call-dispatch-result--${fitCss}"><h2 class="dispatch-header">@UUID[Actor.${callActor.id}]{${callActor.name}}</h2><div class="dispatch-content"><b>${assignedActor.name}</b> is a <b>${fitName}.</b>${fwdTxt}</div></div>`,
		type: CONST.CHAT_MESSAGE_TYPES.OTHER,
	});

	// Set all final flags atomically to prevent intermediate re-renders with inconsistent state
	// (e.g., status="qualified" but snapshot not yet saved would cause graph to extract live labels)
	await callActor.update({
		[`flags.${NS}.dispatchStatus`]: "qualified",
		[`flags.${NS}.fitResult`]: fitResult,
		[`flags.${NS}.forwardChange`]: forwardChange,
		[`flags.${NS}.snapshotHeroLabels`]: snapshotHeroLabels,
	});
	return { success: true };
}

/**
 * Register query handlers for call sheet actions (V13+ CONFIG.queries)
 * Called once during module init
 */
export function registerCallSheetQueries(): void {
	// Assign hero query - GM executes on behalf of Limited user
	CONFIG.queries[`${NS}.assignHero`] = async ({ callActorId, assignedActorIds }) => {
		const actor = game.actors?.get(callActorId);
		if (!actor) return { success: false };
		await actor.setFlag(NS, "assignedActorIds", assignedActorIds);
		return { success: true };
	};

	// Dispatch query - GM executes full dispatch on behalf of Limited user
	CONFIG.queries[`${NS}.dispatch`] = async ({ callActorId }) => {
		const callActor = game.actors?.get(callActorId);
		if (!callActor) return { success: false };
		const ids: string[] = callActor.getFlag(NS, "assignedActorIds") ?? [];
		const hero = ids[0] ? game.actors?.get(ids[0]) : null;
		if (!hero) return { success: false };
		return executeDispatch(callActor, hero);
	};
}

/**
 * Helper to proxy an action through the active GM via query
 */
async function queryGM<T>(queryName: string, data: object): Promise<T | null> {
	const gm = game.users?.activeGM;
	if (!gm) {
		ui.notifications?.warn?.("A GM must be online.");
		return null;
	}
	try {
		return await gm.query(`${NS}.${queryName}`, data, { timeout: 10000 }) as T;
	} catch (e) {
		console.error(`[${NS}] Query failed:`, e);
		return null;
	}
}
