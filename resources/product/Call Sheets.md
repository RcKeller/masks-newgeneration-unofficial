Call Sheet Refactoring Plan
Summary
Refactor Call sheets to fix performance issues, implement proper three-polygon architecture with overlap visualization, integrate with CooldownSystem, and consolidate graph rendering logic.
Critical Files
File	Purpose
src/module/labels-graph-overlay.ts	Core overlay graph - add 3rd polygon, overlap calc
src/module/sheets/call-sheet.ts	Main sheet class - performance, cooldown integration
src/module/turn-cards.ts	Export CooldownSystem, getTeamCombatants
src/module/labels-graph.ts	Add GRAPH_PRESETS for consolidated options
src/public/templates/sheets/call-sheet.hbs	Add data attributes for partial updates
Phase 1: Graph Options Consolidation
1.1 Add GRAPH_PRESETS to labels-graph.ts

export const GRAPH_PRESETS = Object.freeze({
  turnCard: {
    size: 32,
    borderWidth: 0.5,
    showInnerLines: false,
    showVertexDots: false,
    showIcons: false,
    showSpokeDots: false,
  },
  characterSheet: {
    size: 200,
    borderWidth: 2,
    showInnerLines: true,
    showVertexDots: false,
    showIcons: true,
    showSpokeDots: false,
  },
  callSheet: {
    size: 280,
    borderWidth: 2.5,
    showInnerLines: true,
    showVertexDots: false,
    showIcons: true,
    showSpokeDots: true,
  },
});
1.2 Export from turn-cards.ts
Add at bottom:

export { CooldownSystem, getTeamCombatants };
Phase 2: Three-Polygon Architecture
2.1 New Color Scheme (labels-graph-overlay.ts)

Hero Polygon:      ALWAYS yellow (rgba(180, 160, 90, 0.6))
Requirements:      ALWAYS grey (rgba(150, 150, 150, 0.4), dashed)
Overlap Polygon:   Based on fit result:
  - Great (success):  Green (rgba(60, 180, 80, 0.6)) - entire req area
  - Good (partial):   Yellow (rgba(245, 158, 11, 0.6)) - ONLY intersection
  - Poor (failure):   Red (rgba(200, 80, 80, 0.6)) - entire req area
2.2 SVG Layer Order (bottom to top)
Pentagon background (dark)
Grid lines (if enabled)
Requirements polygon (grey dashed) - GM always sees; players only after reveal
Hero polygon (yellow solid) - always shown if hero selected
Overlap polygon (green/yellow/red) - shown after dispatch
2.3 Overlap Calculation Algorithm
For partial success, overlap = where hero stat >= requirement:

function calculateOverlapVertices(
  heroLabels: Record<string, number>,
  requirements: CallRequirements,
  cx: number, cy: number, outerRadius: number
): Vertex[] {
  const vertices: Vertex[] = [];

  for (let i = 0; i < LABEL_ORDER.length; i++) {
    const key = LABEL_ORDER[i];
    const heroValue = heroLabels[key] ?? 0;
    const reqValue = requirements[key];

    if (reqValue == null) continue;  // Skip if no requirement

    const heroFrac = valueToRadiusFraction(heroValue);
    const reqFrac = valueToRadiusFraction(reqValue);

    // Overlap at this vertex = minimum of both (where hero meets/exceeds req)
    const overlapFrac = Math.min(heroFrac, reqFrac);
    const r = outerRadius * overlapFrac;

    const angle = ((i * 72) - 90) * (Math.PI / 180);
    vertices.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }

  return vertices;
}
2.4 Update generateOverlayGraphSVG()
Add third polygon element with class .labels-graph-overlay-overlap:
Rendered between requirements and hero polygons
Color determined by fitResult parameter
For "good" fit: uses calculated overlap vertices
For "great"/"poor" fit: uses full requirements polygon shape
Phase 3: Performance Optimization
3.1 Add _updateGraphInPlace() to call-sheet.ts

async _updateGraphInPlace(changes: 'hero' | 'requirements' | 'fit' | 'all'): Promise<boolean> {
  const container = this.element?.[0]?.querySelector('.call-sheet__graph');
  if (!container) return false;

  const graphData = await this._computeGraphData();

  if (changes === 'hero' || changes === 'all') {
    this._animatePolygonPath(
      container.querySelector('.labels-graph-overlay-hero'),
      graphData.heroPath
    );
  }

  if (changes === 'requirements' || changes === 'all') {
    this._animatePolygonPath(
      container.querySelector('.labels-graph-overlay-requirements'),
      graphData.reqPath
    );
  }

  // Update tooltip data attribute (no re-render)
  container.setAttribute('data-tooltip', graphData.tooltip);
  return true;
}
3.2 Update Event Handlers
Hero hover (_onHoverActor):

_onHoverActor(actorId: string | null) {
  if (this._hoveredActorId === actorId) return;
  this._hoveredActorId = actorId;
  this._updateGraphInPlace('hero');  // Partial update, NOT this.render()
}
Requirement change (_onChangeRequirement):
Debounce input changes (150ms)
Use _updateGraphInPlace('requirements') instead of full render
GM preview should animate smoothly
Actor update listener:
Listen for system.stats changes on assigned hero
Use _updateGraphInPlace('hero') for label changes
3.3 Prevent Tooltip Re-renders
Add data-tooltip-direction attribute and ensure tooltip hover doesn't trigger render cycles.
Phase 4: CooldownSystem Integration
4.1 Hero Filtering in getData()

const activeCombat = game.combat;

// REQUIRE active combat for hero selection
if (!activeCombat) {
  context.characterActors = [];
  context.noCombatWarning = true;
  return context;
}

const teamCombatants = getTeamCombatants(activeCombat);
const teamSize = teamCombatants.length;
const maxCd = CooldownSystem.maxCooldown(teamSize);

// Map actor ID -> combatant for cooldown lookup
const combatantByActorId = new Map(teamCombatants.map(c => [c.actorId, c]));

// Filter to only available heroes (in combat + not on cooldown)
context.characterActors = teamCombatants
  .filter(cbt => !CooldownSystem.isOnCooldown(cbt, maxCd))
  .map(cbt => ({
    id: cbt.actorId,
    name: cbt.actor?.name ?? "Unknown",
    selected: assignedActorIds.includes(cbt.actorId ?? ""),
  }));
4.2 Apply Cooldown on Dispatch
In executeDispatch(), after successful dispatch:

// Apply cooldown to dispatched hero
const combat = game.combat;
if (combat && game.user?.isGM) {
  const teamCombatants = getTeamCombatants(combat);
  const heroCombatant = teamCombatants.find(c => c.actorId === assignedActor.id);
  if (heroCombatant) {
    await CooldownSystem.gmApplyTurn(combat, heroCombatant.id);
  }
}
Phase 5: Stats Snapshot System
5.1 Enhanced Snapshot on Dispatch
When Dispatch clicked, before applying forward changes:

// Snapshot hero's effective stats at dispatch time
const heroData = extractLabelsData(assignedActor);
const statsSnapshot = {
  labels: { ...heroData.labels },  // Deep copy
  timestamp: Date.now(),
  heroActorId: assignedActor.id,
};

// Store snapshot
await callActor.setFlag(NS, "snapshotHeroLabels", statsSnapshot.labels);
await callActor.setFlag(NS, "snapshotTimestamp", statsSnapshot.timestamp);

// THEN apply forward change to actual actor (separate from snapshot)
5.2 Graph Data Source Logic

function getHeroLabelsForGraph(
  actor: Actor | null,
  dispatchStatus: DispatchStatus,
  snapshotLabels: Record<string, number> | null
): Record<string, number> | null {
  // If dispatched, ALWAYS use snapshot (immune to later changes)
  if (dispatchStatus === "qualified" && snapshotLabels) {
    return snapshotLabels;
  }
  // Otherwise use live actor data (before dispatch)
  return actor ? extractLabelsData(actor)?.labels ?? null : null;
}
Phase 6: Template Updates (call-sheet.hbs)
6.1 Add Data Attributes for Partial Updates

<div class="call-sheet__graph"
     data-graph-container
     data-tooltip="{{overlayGraph.tooltip}}"
     data-tooltip-direction="UP">
  {{{overlayGraph.svg}}}
</div>
6.2 No Combat Warning

{{#if noCombatWarning}}
  <div class="call-sheet__no-combat-warning">
    <i class="fas fa-exclamation-triangle"></i>
    No active combat. Start a combat encounter to assign heroes.
  </div>
{{/if}}
Implementation Checklist
Phase 1: Foundation
 Add GRAPH_PRESETS to labels-graph.ts
 Export CooldownSystem, getTeamCombatants from turn-cards.ts
 Update existing usages to use presets (verify turn cards have no inner lines)
Phase 2: Three-Polygon Architecture
 Update OVERLAY_COLORS - hero always yellow, requirements always grey
 Add calculateOverlapVertices() function
 Add overlap polygon to generateOverlayGraphSVG()
 Update createOverlayGraphData() to include fit-based overlap colors
 Update updateOverlayGraphAnimated() to handle 3 polygons
Phase 3: Performance
 Add _updateGraphInPlace() method to call-sheet.ts
 Add _animatePolygonPath() helper method
 Update _onHoverActor() to use partial update
 Add debounced _onChangeRequirement() with partial update
 Update actor change listener to use partial update
 Fix tooltip hover to not trigger re-renders
Phase 4: Cooldown Integration
 Import CooldownSystem, getTeamCombatants in call-sheet.ts
 Update getData() to require active combat
 Filter heroes by cooldown status
 Apply cooldown in executeDispatch()
 Add "no combat" warning UI
Phase 5: Stats Snapshot
 Enhance snapshot storage in executeDispatch()
 Update graph data source to prefer snapshot when qualified
 Verify forward changes don't affect displayed graph
Phase 6: Template & Polish
 Add data attributes to call-sheet.hbs
 Add no-combat warning markup
 Test all fit result combinations
 Verify animation smoothness across all scenarios
Testing Scenarios
Performance: Change requirements rapidly - graph should animate, form should NOT re-render
Hero switch: Select different hero - graph polygon animates, no form flicker
Tooltip hover: No re-render or flash on hover
Full success: Entire requirements area turns green
Partial success: Only overlap area turns yellow
Failure: Entire requirements area turns red
No combat: Hero dropdown disabled with warning
Cooldown: Heroes on cooldown not shown in dropdown
Dispatch cooldown: Dispatched hero enters cooldown in turn cards
Snapshot persistence: Forward changes don't affect call graph after dispatch
