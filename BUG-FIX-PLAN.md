# Bug Fix Plan - Masks New Generation Unofficial

This document enumerates all reported bugs, user instructions, and a plan to fix each issue.

---

## Critical Principle

**Do NOT create custom handlers that conflict with PbtA's built-in handlers.** The PbtA system already handles:
- `.attr-clock` - Clock/pip clicks via `_onClockClick`
- `.attr-xp` - XP pips via `_onClockClick`
- `.attr-list` - Checkbox lists (ListMany type)
- `.attr-track-value`, `.attr-track-step` - Track handling
- `.resource-control` - Resource increment/decrement
- Playbook advancement via `playbook.handleChoices()` and `playbook.grantChoices()`

Reference file: `templates/parts/actor-attributes.hbs` shows the correct patterns.

---

## Bug 1: Doom Track (Clock Type) Not Working

### Status
BROKEN

### User Instructions
- Move Doom track to Playbook tab
- Must show current state (filled/unfilled pips)
- Must be toggleable/editable
- Use PbtA's existing Clock handling pattern

### Reference Pattern (from actor-attributes.hbs)
```handlebars
{{#if (eq attr.type "Clock")}}
    <div class="cell__clock flexrow">
        {{#times attr.max}}
        <input type="checkbox" class="attr-clock" data-name="system.attributes.{{key}}" data-step="{{@index}}" {{checked (gt attr.value @index)}}>
        {{/times}}
    </div>
{{/if}}
```

### Plan
1. In `actor-playbook-tab.hbs`, use exact PbtA pattern for Clock type
2. Use `class="attr-clock"` (not custom classes)
3. Use `data-name="system.attributes.{{attr.key}}"` and `data-step="{{@index}}"`
4. Use `{{checked (gt ../attr.value @index)}}` for state
5. Ensure NOT overriding PbtA's `times` helper (it provides `@index`, 0-indexed)
6. Do NOT add custom click handlers - PbtA's `_onClockClick` handles it

---

## Bug 2: ListMany Checkboxes Not Toggleable

### Status
BROKEN

### User Instructions
- Playbook features like Beacon's Drives cannot be toggled
- Text fields within ListMany options cannot be edited
- Must use PbtA's existing ListMany handling pattern

### Reference Pattern (from actor-attributes.hbs)
```handlebars
{{#if (eq attr.type "ListMany")}}
    <ul class="cell__checkboxes flexcol">
        {{#each attr.options as |option optionKey|}}
            <label class="flexrow" {{#if option.tooltip}}data-tooltip="{{option.tooltip}}" data-tooltip-direction="UP"{{/if}}>
                {{#if option.values}}
                    {{#each option.values as |suboption suboptionKey|}}
                        <input type="checkbox" class="attr-list" name="system.attributes.{{key}}.options.{{optionKey}}.values.{{suboptionKey}}.value" {{checked suboption.value}}/>
                    {{/each}}
                {{else}}
                    <input type="checkbox" class="attr-list" name="system.attributes.{{key}}.options.{{optionKey}}.value" {{checked option.value}}/>
                {{/if}}
                {{#if (eq option.label "[Text]")}}
                    <input type="text" class="input input-title" name="system.attributes.{{key}}.options.{{optionKey}}.userLabel" value="{{option.userLabel}}">
                {{else}}
                    {{option.label}}
                {{/if}}
            </label>
        {{/each}}
    </ul>
{{/if}}
```

### Plan
1. Use `class="attr-list"` for checkboxes
2. Use proper `name="system.attributes.{{attr.key}}.options.{{optionKey}}.value"` path
3. Handle nested `option.values` for multi-checkbox options
4. Text fields use `name="system.attributes.{{attr.key}}.options.{{optionKey}}.userLabel"`
5. Do NOT add custom checkbox handlers

---

## Bug 3: Playbook Change Not Prompting for Moves/Elections

### Status
CRITICAL - INCORRECTLY IMPLEMENTED

### User Instructions
> "The logic for this is incorrect - it is generalized, but the logic per each playbook is different. Scrutinize the original code closely and implement the EXACT SAME DIALOGUE!!!! The logic for deleting old moves, and taking the new ones, needs to be the exact fucking same to have parity."

The original PbtA implementation shows elections with icons and proper dialogs.

### Reference Pattern (from PbtA's _onAdvance)
```javascript
async _onAdvance(event) {
    event.preventDefault();
    const advancements = this.actor.system.advancements;
    const xp = Object.entries(this.actor.system.attributes).find(([key, data]) => data.type === "Xp");
    const updates = { "system.advancements": advancements + 1 };
    if (xp) {
        const key = xp[0];
        updates[`system.attributes.${key}.value`] = 0;
    }
    await this.actor.update(updates);
    const playbook = this.actor.items.find((i) => i.type === "playbook");
    const choiceUpdate = await playbook.handleChoices(playbook);
    if (Object.keys(choiceUpdate).length > 0) {
        await playbook.update(choiceUpdate);
        const grantedItems = await playbook.grantChoices(choiceUpdate);
        await playbook.update({ "flags.pbta": { grantedItems } });
    }
}
```

### Plan
1. Study PbtA's playbook item class methods: `handleChoices()` and `grantChoices()`
2. When playbook changes, use these methods instead of custom dialog
3. The playbook item itself knows its elections/choices - don't recreate that logic
4. Let PbtA handle the dialog presentation with icons
5. Properly delete old playbook moves when switching

---

## Bug 4: Checkbox Double-Click Issue

### Status
BROKEN

### User Instructions
Checkboxes on playbook attributes require double-click to toggle, or toggle twice unexpectedly.

### Cause
Custom handlers were added that conflict with:
1. Standard form submission
2. PbtA's built-in handlers

### Plan
1. Remove ALL custom checkbox click handlers from actor-sheet.mjs
2. Use standard form submission via proper `name` attributes
3. Ensure checkboxes have correct `name` and `{{checked}}` patterns
4. Do NOT use `event.preventDefault()` on checkbox clicks if using form submission

---

## Bug 5: Move Icon Click Not Working

### Status
BROKEN

### User Instructions
Clicking move icon should send to chat (share or roll depending on move type).

### Plan
1. Check that `data-action="roll-move"` and `data-action="share-move"` are properly bound
2. Verify the action handlers in actor-sheet.mjs
3. Ensure PbtA's move rolling/sharing methods are called correctly

---

## Bug 6: Moment of Truth Styling

### Status
PARTIALLY FIXED

### User Instructions
- Locked/unlocked states look terrible
- Text is black-on-dark background instead of matching sheet theme
- Should look consistent with rest of the sheets

### Plan
1. Check CSS for `.playbook-section--moment` and lock toggle styling
2. Ensure text colors use CSS variables or inherit properly
3. Match styling to existing sheet patterns

---

## Bug 7: Condition Toggle Backgrounds

### Status
PARTIALLY FIXED

### Plan
1. Review condition toggle CSS
2. Ensure backgrounds match expected design

---

## Bug 8: Collapse Animation

### Status
PARTIALLY FIXED

### User Instructions
Animation is too choppy.

### Plan
1. Review CSS transitions for collapsible elements
2. Consider using `max-height` transitions or `transform` instead of `height`
3. May need to set explicit heights or use CSS Grid/Flexbox for smoother animations

---

## Bug 9: Pentagon Icons

### Status
PARTIALLY FIXED

### Plan
1. Review label icon implementation
2. Ensure icons display correctly in labels graph

---

## Bug 10: Times Helper Conflict

### Status
ROOT CAUSE OF MULTIPLE BUGS

### Problem
Masks module registered a custom `times` helper that was 1-indexed and did NOT provide `@index`. PbtA's `times` helper is 0-indexed and provides `@index` via the data frame.

### Reference - PbtA's times helper
```javascript
data = Handlebars.createFrame(options.data);
for (let i = 0; i < n; ++i) {
    if (data) {
        data.index = reverse ? (n - i - 1 + start) : (i + start);
        data.first = i === 0;
        data.last = i === (n - 1);
    }
    accum += options.fn(i, { data: data });
}
```

### Plan
1. Remove or comment out the custom `times` helper in masks.mjs
2. Use PbtA's built-in `times` helper
3. If 1-indexed display is needed, use `{{sum @index 1}}` helper

---

## Implementation Checklist

### Before Making Changes
- [ ] Read the file being modified
- [ ] Understand existing PbtA patterns
- [ ] Identify what PbtA already handles

### For Each Fix
- [ ] Use PbtA's existing CSS classes and handlers
- [ ] Do NOT create custom handlers that duplicate PbtA functionality
- [ ] Test that form submission works (checkboxes save on change)
- [ ] Test that clicking works (clocks/pips toggle correctly)
- [ ] Verify styling matches existing sheet theme

### Files Likely Affected
- `module/masks.mjs` - Remove custom times helper
- `module/sheets/actor-sheet.mjs` - Remove conflicting handlers, fix playbook change
- `templates/parts/actor-playbook-tab.hbs` - Use correct PbtA patterns
- `css/masks-sheets.css` - Styling fixes

---

## Key Reference Files

1. **PbtA's actor-attributes.hbs** - Shows correct patterns for all attribute types
2. **PbtA's actor-sheet.js** - Shows how handlers work (`_onClockClick`, etc.)
3. **PbtA's playbook item class** - Shows `handleChoices()` and `grantChoices()` methods
4. **Existing working sheet** - Compare against what was working before changes
