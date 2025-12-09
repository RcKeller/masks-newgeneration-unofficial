FIX THE FOLLOWING BUGS:
- CRITICAL BUG: Players aren't advancing from 1 cooldown remaining > ready state when anything else ticks a turn. They SHOULD be updated anytime a turn is taken. Taking a turn should reset players at their final tick to a ready to act state. YES, PLAYERS CAN ACT MULTIPLE TIMES PER ROUND IN AN ENCOUNTER. The idea behind the cooldown bar is to "throttle" players from playing too often and making the game unfair for others. YOU DO NOT NEED TO WAIT FOR ALL OTHER PLAYERS TO TAKE THEIR TURN!
- MISSING FEATURE: The "Aid" feature isn't working for players. Clicking the advantage button on a turn card of another player. This should have a disabled state if team points have been depleted or the player has been downed.
- MISSING FEATURE: Players marking Action aren't actually registering/taking their turn in the system!
- GMs should be able to add/remove forward from any character at any time
- Do not show the Action button when hovering over a busy character.
- Cooldown bars should progress the opposite way - RIGHT TO LEFT ("burn down"). IMPORTANT, these bars should be animated so they smoothly drain with a css animation when applicable.
- Restyle the "Downed" tag so that it is in the same place as the cooldown bar/"Busy" would be.
- When adding Forward to yourself, or when the GM does it, do not deduct team. Otherwise, make sure `@UUID[Compendium.masks-newgeneration-unofficial.moves.H7mJLUYVlQ3ZPGHK]{Aid a Teammate}` is appended to the message sent out to the chat.
- The "Aid" feature where a player can add forward to another character by spending a team point is broken. The click is a no-op even if the player does have team to spend... fix this.
The javascript for turn-cards is also extremely messy and convoluted due to lots of iteration, please simplify.

You have permission to substantially refactor and simplify if that will make this cleaner and fix the critical bugs.

THIS HAS BEEN SUCH A BUGGY SYSTEM THAT I NEED YOU TO TEAR-DOWN AND COMPLETELY RE-IMPLEMENT THE COOLDOWN SYSTEM FROM START TO FINISH. ALL OF THE EXISTING LOGIC MUST BE REMOVED, THEN RE-IMPLEMENTED AGAIN - THIS TIME CORRECTLY. I'm not sure why player turn cards aren't resetting properly but I know the current solution is A) overwrought and B) the bugs can't be fixed. Something intrinsic to the design and implementation is breaking it all.

Output the fully revised code (ALL OF IT). No need to re-output other unrelated scss styles, but all of the styling pertaining to turn cards - yeah, reoutput it all.

=======
ORIGINAL REQUIREMENTS (have mostly been implemented, and is superseded by any instructions provided immediately above)
=======
### 1. Add a new UI component to display team turn cards

1. **Mount location** – Insert a new container element into `#ui-middle #ui-bottom`.  This container must hold a series of cards representing all *playable* characters (type `character`) currently participating in the active encounter.

2. **Card layout** – Each card should:
   * **Portrait** – Display the actor’s main portrait (`actor.img`), not the token image.  Use CSS `object-fit: cover` so the portrait fills the card’s top area without distortion.
   * **Name plate** – A horizontal bar immediately under the portrait shows the character’s name in ALL CAPS with white text.  Use `text-transform: uppercase` in CSS.  The bar’s background color should be `#bda78a` (the same color as the card).
   * **Downed overlay** – If the actor’s health is zero or they are otherwise flagged as downed, overlay the entire card with a semi‑transparent grey tint and display “DOWNED” at the top.  The downed status should also grey out the card content.
   * **Potential (star)** – At the bottom‑right corner, render a circular icon (white star on a grey circle with white outline).  This represents the actor’s “potential” (0–5).  Use the Font Awesome star icon.  When the actor has zero potential, the circle is empty; as potential increases, fill the circle with `#f9a949` (potential color).  By 5 points it should be completely filled.  Clicking the star increments the actor’s potential by 1 (clamping at 5).  Persist this in a suitable actor property or flag so it survives reloads.
   * **Labels shortcut** – At the bottom‑left corner place a grey pentagon with a white outline.  This is a placeholder for a future feature.  Use the Font Awesome pentagon icon (available in the “Shapes” set) and style it with color `#37372b`.
   * **Advantage/Aid Button** – There is a button above the Labels shortcut that allows players to A) add/remove a point of Forward from themselves, or allow a GM to add/remove forward from anybody, and B) allow players to add a point of forward by spending a point of Team, if available.
   * **Clickable card** – Clicking anywhere else on the card (excluding the buttons and potential/star) should open the actor’s character sheet.

3. **Card background and colors** – Use the following palette:
   * **Card base and nameplate** – `#bda78a`
   * **Primary background** – `#f4e7d7`
   * **Secondary background** – `#ead0b0`
   * **Active background** – `#d1a06e`
   * **Action button background** – `#69c0ae`
   * **Cooldown bar** – `#2ab6cb`
   * **Potential fill** – `#f9a949`
   * **Pentagon color** – `#37372b`
     Cards should be slightly transparent (`opacity: 0.75`) when the actor is on cooldown.  If the actor’s image has transparency, ensure the card’s background color (`#bda78a`) shows through.

4. **Responsive layout** – The cards should appear in a single row (horizontal scroll or wrap if necessary) within the `#ui-middle #ui-bottom` container.  Each card should have consistent width and height, and should scale well across various screen sizes.

---

### 2. Implement turn and cooldown logic

1. **Track active team members** – Use the active `Combat` object to determine which actors should appear on cards.  Filter `combat.combatants` for entries whose `actor.type` is `character` and whose `actor` exists.  Do not include NPCs or minions.

2. **Cooldown concept** – The game uses a rolling cooldown concept to allow players to act freely, but prevent them from acting too often. When an Action is taken by a player, they begin a cooldown represented as an integer `remainingTurns` equal to `(team size – 1)` immediately after the character acts.  Each time another character (or the GM card) takes a turn, decrement `remainingTurns` by 1.  When `remainingTurns` reaches 0, that character becomes “ready” again and their card returns to full opacity. Cooldowns are not directly tied to "rounds" in an encounter.

3. **Visualizing cooldown** – Display a horizontal bar on each card that indicates `remainingTurns / (team size – 1)`.  The bar should fill from right to left and use color `#2ab6cb`.  For example, with 5 heroes:
   * **After A acts** → `remainingTurns = 4` → bar shows 100 % (4/4), card is greyed.
   * **After two other heroes act** → `remainingTurns = 2` → bar shows 50 %.
   * **After three other heroes act** → `remainingTurns = 1` → bar shows 25 %.
   * **After four other heroes act (everyone else)** → `remainingTurns = 0` → bar is hidden or empty, card fully active.
     Adjust automatically when the team size changes (characters join or leave).

4. **Recording turns** – Provide methods:

   * `onActorTurn(actorId)` – Called when any character takes a turn.  Sets that actor’s `remainingTurns = teamSize - 1` and greys out the card.
   * `advanceCooldowns()` – Called whenever any character (or GM) ends a turn.  Decrements `remainingTurns` for every other actor that is currently greater than zero.  If `remainingTurns` hits zero, update the card to active.
   * Persist `remainingTurns` and update UI when a combat starts or resumes.

5. **Greying out and reactivating cards** – When `remainingTurns` > 0 or the actor is downed, apply a 25 % opacity to the entire card (except overlays such as the “DOWNED” label).  Remove the opacity once the actor becomes ready.

---

### 4. Handle potential (experience) points

1. **Potential tracking** – Each playable character has 0–5 potential points (analogous to XP/potential in Masks).  Store this number in an actor flag or a new resource (`actor.system.resources.potential.value`) so it persists.

2. **Star icon behaviour** – The star icon should visually fill with `#f9a949` as potential increases.  The grey circle background remains visible for unfilled segments.  Clicking the star increments potential by 1 up to a maximum of 5.  Update the UI on click, and optionally play a sound or animation for feedback.

3. **Resetting potential** – Provide a way (e.g., via another button or through a separate system) to reset potential back to 0 when necessary; this can be added later.

### 5. Aid Feature

- The effective bonus for a character is Forward + Ongoing
- The Aid/Bonus button renders directly above the Shift Labels button on a turn card.
- If effective bonus is 0, the border is transparent and background transparent
- If effective bonus is >0, show the number and have the background of the button be blue, with white border
- The GM can left click the aid button to add Forward to any character. Right click to remove it. Announce change via system message
- Players can add/remove Forward to themselves at no cost. Announce change via system message
- If Team Points are available, Players can add/remove forward from that companion by spending a point of team when they do so. Announce these actions to the chat along with a link to Aid a Teammate. In this scenario, make sure `@UUID[Compendium.masks-newgeneration-unofficial.moves.H7mJLUYVlQ3ZPGHK]{Aid a Teammate}` is appended to the message sent out to the chat.

---

### 6. Action Button

If a character is not on cooldown, that player or the GM may take Action for them by clicking the Action button
This activates cooldown for them, and then that button is no longer visible

### 5. Style and UX requirements

1. **Consistent theming** – Reuse the module’s existing SCSS architecture.  Define new CSS custom properties for card backgrounds, bars, and icons.  Ensure dark mode support if the module has an option for dark mode.

2. **Use of Font Awesome** – Use Font Awesome icons (already available in the module) for the star and pentagon.  The pentagon icon is part of Font Awesome’s shapes collection.  Make sure icons are sized consistently with the rest of the UI.

3. **Accessibility** – Add `aria-label` attributes to interactive elements (buttons, stars) and ensure the “DOWNED” label is visually and programmatically associated with the card for screen readers.

4. **Responsiveness** – Handle resizing gracefully.  Cards should not overlap; use flexbox or CSS grid for layout.  Add a scroll bar or wrap to a new line if there are more cards than fit horizontally.

5. **Testing** – Test with multiple team sizes, including very small (1–2) and large (6+) groups.  Check that cooldown logic resets correctly when characters are removed from or added to the encounter.
