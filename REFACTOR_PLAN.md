# Call Actor Type Refactoring Plan

## Problem Statement

The "Call" feature is currently implemented incorrectly as a **custom sheet for NPC actors**:
```typescript
// CURRENT (WRONG)
Actors.registerSheet('masks-newgeneration-unofficial', CallSheet, {
    types: ['npc'],  // <-- Wrong: Calls are not NPCs
    makeDefault: false,
    label: 'DISPATCH.SheetConfig.call',
});
```

This creates UX issues:
- Users must create an NPC, then manually switch its sheet to "Dispatch Call Sheet"
- Calls inherit NPC baggage (stats, conditions, moves) that don't apply
- Confusing for users - a "Call" is conceptually different from an "NPC"

## Solution: Use PbtA's `other` Actor Type

**Key Insight**: FoundryVTT systems define actor types in `template.json`. Modules **cannot** add new types - they can only work with existing types. However, PbtA explicitly provides an `other` type for this exact use case:

```json
// systems/pbta/template.json
{
  "Actor": {
    "types": ["character", "npc", "other"]  // <-- "other" exists for custom types!
  }
}
```

**Critical Discovery**: PbtA dynamically builds the actor creation dropdown from `game.pbta.sheetConfig.actorTypes`. A type will ONLY appear in the dropdown if:
1. It exists in template.json (character, npc, other)
2. It is configured in `game.pbta.sheetConfig.actorTypes`

The `label` property in the config determines the display name (line 3708 in pbta.js):
```javascript
const pbtaLabel = game.pbta.sheetConfig.actorTypes[type].label;
```

**The fix**: Add `other` to `game.pbta.sheetConfig.actorTypes` with `label: "Call"`

---

## Implementation Steps

### Phase 1: Register CallSheet for `other` Type

**File: `src/module/masks.ts`**

Change the sheet registration from:
```typescript
// BEFORE (Wrong)
Actors.registerSheet('masks-newgeneration-unofficial', CallSheet, {
    types: ['npc'],
    makeDefault: false,
    label: 'DISPATCH.SheetConfig.call',
});
```

To:
```typescript
// AFTER (Correct)
Actors.registerSheet('masks-newgeneration-unofficial', CallSheet, {
    types: ['other'],
    makeDefault: true,  // Make it the default sheet for "other" type
    label: 'DISPATCH.SheetConfig.call',
});
```

---

### Phase 2: Configure `actorTypes.other` in PbtA Sheet Config

**File: `src/module/helpers/config-sheet.ts`**

Add configuration for the `other` actor type with minimal/no stats:

```typescript
actorTypes: {
    character: { /* existing config */ },
    npc: { /* existing config */ },

    // NEW: Call actor type configuration
    other: {
        // Calls don't use PbtA stats/attributes - all data is stored in flags
        // This minimal config prevents PbtA from adding unwanted fields
        stats: {},
        attributes: {},
        details: {
            biography: {
                label: game.i18n.localize("DISPATCH.Call.Description"),
                type: "LongText",
                value: "",
            }
        },
        moveTypes: {},
    }
}
```

---

### Phase 3: Add Localization to Rename "other" to "Call"

**File: `src/public/lang/en.json`**

Add the actor type label:
```json
{
    "TYPES": {
        "Actor": {
            "other": "Call"
        }
    },
    "DISPATCH": {
        "Call": {
            "TypeLabel": "Call",
            "Description": "Description",
            "Types": {
                "assault": "Assault",
                "rescue": "Rescue",
                "investigation": "Investigation",
                "social": "Social",
                "disaster": "Disaster"
            },
            "Fit": {
                "great": "Great Fit",
                "good": "Decent Fit",
                "poor": "Poor Fit"
            }
        }
    }
}
```

**File: `src/module/masks.ts`** (in the `pbtaSheetConfig` hook or `init` hook)

Override the default "other" label to show "Call":
```typescript
Hooks.once('ready', () => {
    // Override "other" type label to show "Call" in actor creation dialog
    if (game.i18n.translations.TYPES?.Actor) {
        game.i18n.translations.TYPES.Actor.other = game.i18n.localize("DISPATCH.Call.TypeLabel");
    }
});
```

---

### Phase 4: Update CallSheet to Expect `other` Type

**File: `src/module/sheets/call-sheet.ts`**

The CallSheet currently extends `ActorSheet` directly, which is correct since Calls don't need PbtA's sheet features. However, ensure the sheet properly handles the `other` type:

1. Update any type checks from `'npc'` to `'other'`:
```typescript
// If there are any type checks like this:
if (this.actor.type === 'npc') { ... }  // WRONG

// Change to:
if (this.actor.type === 'other') { ... }  // CORRECT
```

2. The sheet already stores all Call-specific data in flags (callType, callerName, requirements, etc.), so no data model changes are needed.

---

### Phase 5: Clean Up Documentation

**File: `CLAUDE.md`**

Update the documentation to reflect the new architecture:

```markdown
### Call Actor Type

Calls use PbtA's `other` actor type (modules cannot add new types to FoundryVTT).
The `other` type is configured with minimal PbtA schema since Calls store all data in flags:

- `flags.masks-newgeneration-unofficial.callType` - assault, rescue, etc.
- `flags.masks-newgeneration-unofficial.callerName` - NPC caller name
- `flags.masks-newgeneration-unofficial.callerQuote` - Flavor text
- `flags.masks-newgeneration-unofficial.requirements` - Label thresholds
- `flags.masks-newgeneration-unofficial.assignedActorIds` - Hero assignment
- `flags.masks-newgeneration-unofficial.dispatchStatus` - idle/assessing/qualified
- `flags.masks-newgeneration-unofficial.fitResult` - great/good/poor
- `flags.masks-newgeneration-unofficial.forwardChange` - Forward modifier applied

The sheet is registered as the default for `other` type actors.
```

---

### Phase 6: Migration (Optional)

If there are existing actors using the old NPC+CallSheet approach, you may want to provide a migration:

**Option A: Manual Migration**
- Document for users: "Delete old Call NPCs and create new Call actors"

**Option B: Automated Migration**
```typescript
Hooks.once('ready', async () => {
    if (!game.user?.isGM) return;

    // Find NPCs with CallSheet flags that should be migrated to "other" type
    const callNPCs = game.actors?.filter(a =>
        a.type === 'npc' &&
        a.getFlag('masks-newgeneration-unofficial', 'callType')
    ) ?? [];

    if (callNPCs.length > 0) {
        // Warn GM about migration needed
        ui.notifications?.warn(`Found ${callNPCs.length} old Call NPCs. Consider recreating them as Call actors.`);
    }
});
```

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/module/masks.ts` | Change sheet registration from `types: ['npc']` to `types: ['other']` with `makeDefault: true` |
| `src/module/helpers/config-sheet.ts` | Add `actorTypes.other` configuration with minimal schema |
| `src/public/lang/en.json` | Add `TYPES.Actor.other: "Call"` and Call-related labels |
| `src/module/sheets/call-sheet.ts` | Update any `'npc'` type checks to `'other'` |
| `CLAUDE.md` | Document the new Call actor architecture |

---

## Why This Approach Works

1. **Respects FoundryVTT architecture**: We use an existing type instead of hacking a new one
2. **Clean separation**: Calls are distinct from NPCs in the actor sidebar
3. **Better UX**: Users create "Call" actors directly from the actor directory
4. **No baggage**: Calls don't inherit NPC stats/conditions they don't need
5. **PbtA-compatible**: Works with the PbtA system's configuration system

---

## Testing Checklist

- [ ] Create new Call actor from Actor Directory (+Add Actor button shows "Call" option)
- [ ] CallSheet opens correctly for new Call actors
- [ ] Call metadata (type, caller name, quote) saves correctly
- [ ] Requirements pentagon renders and edits correctly
- [ ] Hero assignment dropdown shows active combat characters
- [ ] Dispatch flow works (assessing -> qualified)
- [ ] Fit result calculates and displays correctly
- [ ] Forward modifier applies to assigned hero
- [ ] Chat message posts on dispatch
- [ ] Reset button clears dispatch state
- [ ] Old NPC-based calls are identified (for migration warning)
