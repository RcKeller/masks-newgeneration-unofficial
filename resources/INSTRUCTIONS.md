We recently implemented "Turn Cards" for my Foundry v13 module adaptation of Masks: A New Generation. These serve as an enriched initiative tracker and are supposed to deeply integrate, providing an ongoing turn tracker/cooldown system that makes it clear which players in the encounter are available to act and when. I've finished my rough draft implementation, however there are several flaws and ways the design and implementation can be improved or completed.

Please keep in mind that the code we have thus far is a VERY ROUGH DRAFT and I personally would love to revise it.
There are a ton of critical bugs that MUST be fixed.

---

FIX THE FOLLOWING BUGS:
- Taking a turn should reset players at their final tick to a ready to act state. YES, PLAYERS CAN ACT MULTIPLE TIMES PER ROUND IN AN ENCOUNTER. The idea behind the cooldown bar is to "throttle" players from playing too often and making the game unfair for others.
- BUG: When a GM clicks the Advantage 
- GMs can add/remove forward from any character
- Do not show the Action button when hovering over a busy character.
- Cooldown bars should progress the opposite way - RIGHT TO LEFT ("burn down"). IMPORTANT, these bars should be animated so they smoothly drain with a css animation when applicable.
- Restyle the "Downed" tag so that it is in the same place as the cooldown bar/"Busy" would be.
- When adding Forward to yourself, or when the GM does it, do not deduct team. Otherwise, make sure `@UUID[Compendium.masks-newgeneration-unofficial.moves.H7mJLUYVlQ3ZPGHK]{Aid a Teammate}` is appended to the message sent out to the chat.
- The "Aid" feature where a player can add forward to another character by spending a team point is broken. The click is a no-op even if the player does have team to spend... fix this.
- CRITICAL BUG: Players aren't advancing from 1 cooldown remaining > ready state when anything else ticks a turn. They SHOULD be updated anytime a turn is taken.
- CRITICAL BUG: The "Aid" feature isn't working for players. Clicking the advantage button on a turn card of another player. This should have a disabled state if team is depleted or the player has been downed. They also should
- CRITICAL BUG: Players marking Action aren't actually registering/taking their turn in the system!

The javascript for turn-cards is also extremely messy and convoluted due to lots of iteration, please simplify.

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
   * **Advantage Button** – There is a button above the Labels shortcut that allows players to A) add/remove a point of Forward from themselves, or allow a GM to add/remove forward from anybody, and B) allow players to add a point of forward by spending a point of Team, if available.
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

2. **Cooldown concept** – Each playable character cannot act again until *all other* playable characters have taken a turn.  Represent the cooldown as an integer `remainingTurns` equal to `(team size – 1)` immediately after the character acts.  Each time another character (or the GM card) takes a turn, decrement `remainingTurns` by 1.  When `remainingTurns` reaches 0, the character becomes “ready” and their card returns to full opacity.

3. **Visualizing cooldown** – Display a horizontal bar on each card that indicates `remainingTurns / (team size – 1)`.  The bar should fill from right to left and use color `#2ab6cb`.  For example, with 5 heroes:

   * **After A acts** → `remainingTurns = 4` → bar shows 100 % (4/4), card is greyed.
   * **After two other heroes act** → `remainingTurns = 2` → bar shows 50 %.
   * **After three other heroes act** → `remainingTurns = 1` → bar shows 25 %.
   * **After four other heroes act (everyone else)** → `remainingTurns = 0` → bar is hidden or empty, card fully active.
     Adjust automatically when the team size changes (characters join or leave).

4. **Recording turns** – Provide methods:

   * `onActorTurn(actorId)` – Called when a character takes a turn.  Sets that actor’s `remainingTurns = teamSize - 1` and greys out the card.
   * `advanceCooldowns()` – Called whenever any character (or GM) ends a turn.  Decrements `remainingTurns` for every other actor that is currently greater than zero.  If `remainingTurns` hits zero, update the card to active.
   * Persist `remainingTurns` and update UI when a combat starts or resumes.

5. **Greying out and reactivating cards** – When `remainingTurns` > 0 or the actor is downed, apply a 25 % opacity to the entire card (except overlays such as the “DOWNED” label).  Remove the opacity once the actor becomes ready.

---

### 4. Handle potential (experience) points

1. **Potential tracking** – Each playable character has 0–5 potential points (analogous to XP/potential in Masks).  Store this number in an actor flag or a new resource (`actor.system.resources.potential.value`) so it persists.

2. **Star icon behaviour** – The star icon should visually fill with `#f9a949` as potential increases.  The grey circle background remains visible for unfilled segments.  Clicking the star increments potential by 1 up to a maximum of 5.  Update the UI on click, and optionally play a sound or animation for feedback.

3. **Resetting potential** – Provide a way (e.g., via another button or through a separate system) to reset potential back to 0 when necessary; this can be added later.

---

### 5. Style and UX requirements

1. **Consistent theming** – Reuse the module’s existing SCSS architecture.  Define new CSS custom properties for card backgrounds, bars, and icons.  Ensure dark mode support if the module has an option for dark mode.

2. **Use of Font Awesome** – Use Font Awesome icons (already available in the module) for the star and pentagon.  The pentagon icon is part of Font Awesome’s shapes collection.  Make sure icons are sized consistently with the rest of the UI.

3. **Accessibility** – Add `aria-label` attributes to interactive elements (buttons, stars) and ensure the “DOWNED” label is visually and programmatically associated with the card for screen readers.

4. **Responsiveness** – Handle resizing gracefully.  Cards should not overlap; use flexbox or CSS grid for layout.  Add a scroll bar or wrap to a new line if there are more cards than fit horizontally.

5. **Testing** – Test with multiple team sizes, including very small (1–2) and large (6+) groups.  Check that cooldown logic resets correctly when characters are removed from or added to the encounter.

This file is a merged representation of a subset of the codebase, containing specifically included files and files not matching ignore patterns, combined into a single document by Repomix.

---------------

# Overview of _Masks_
_Masks_ is a tabletop roleplaying game about young superheroes exploring identity, relationships, and heroism. Characters are part of a team trying to figure out who they are while juggling personal lives and saving Halcyon City. The system uses a collaborative conversation model (dialogue between players and GM), supported by lightweight mechanics to resolve uncertain outcomes and push story forward.

## Core Concepts and Structures

### 1. Conversation & Framing Scenes
*   **The game flows through conversation** among players and the GM. Everyone describes what their characters do, think, and feel.  
*   **Scenes** are framed like comic book panels: a location, the characters present, and a situation that drives action. Scenes should start in medias res or move to where interesting decisions need to be made, often with the question, “What do you do?”  
*   **Playing to Find Out**: Instead of planning outcomes, players discover the story by reacting to mechanics and the fiction. That uncertainty is part of the game’s fun.
    
### 2. Moves
Moves are structured triggers with associated outcomes. To trigger a move, characters must actually do what the move requires. If uncertain about what happens next, consult the move.
**Types of Moves:**
*   **Basic Moves**: Common actions available to all characters, such as directly engage a threat, unleash your powers, defend someone, assess the situation, provoke someone, comfort or support someone, and pierce someone’s mask.  
*   **Playbook Moves**: Special moves unique to each playbook, highlighting a character’s niche.  
*   **Team Moves**: Trigger when heroes share a triumphant celebration or a vulnerability/weakness.  
*   **GM Moves**: The GM uses these to drive conflict when the narrative stalls, or when players roll a miss.  
*   **Adult Moves**: Late in the campaign, characters can unlock mature, more potent moves (e.g., overwhelming a vulnerable foe, persuading someone with their best interests).  
**Rolling Dice:**
*   Most moves instruct players to roll 2d6 and add a relevant Label or other modifiers.  
*   **Results**:
    *   **10+ (Strong Hit)**: A full success, granting best results.
    *   **7-9 (Weak Hit)**: A partial success with complications or costs.
    *   **6- (Miss)**: The move fails or the GM makes a hard move against the character.

### 3. Labels
Labels measure how characters see themselves and how others perceive them. Each character has five Labels:
*   **Danger**: How threatening/powerful they feel.  
*   **Freak**: How strange/unique they feel.  
*   **Savior**: How protective/self-sacrificing they are.  
*   **Superior**: How capable and clever they feel relative to others.  
*   **Mundane**: How ordinary/human they feel.  
**Label Shifts**:
*   Characters’ Labels change frequently—triggered by influence, moves, or in-character choices.  
*   When a Label changes, another must shift in the opposite direction unless it’s locked (±3 or –2).  
*   If a shift would push past the extremes, no shift happens and the player marks a condition instead.
    
### 4. Influence
*   **Influence** represents how much a character cares about someone else’s opinion.  
*   Characters must track who holds Influence over them and over whom they have Influence.  
*   **Gaining Influence** allows someone to shift the target’s Labels (following the fiction).  
*   Influence can be used or given up to push narrative changes (e.g., take an extra +1, inflict a condition).
    
### 5. Conditions
When things go wrong, characters mark conditions—negative emotional states that hinder performance:
*   **Afraid**: –2 to directly engage a threat  
*   **Angry**: –2 to comfort/support or pierce the mask  
*   **Guilty**: –2 to provoke or assess  
*   **Hopeless**: –2 to unleash powers  
*   **Insecure**: –2 to defend or reject others’ Influence
    
Characters clear conditions through specific actions (e.g., venting anger, acting to absolve guilt, or through specific moves).
### 6. Team & Team Pool
*   **Team Pool** is a collective resource used to enhance rolls or aid teammates in combat.  
*   Team points are gained at the start of battle (and via moves) and spent to give +1 to a teammate’s roll or to act selfishly to raise your own Label temporarily.  
*   Scenes start with 1 team by default or more if entering battle with a dangerous foe as a team.
    
### 7. Moment of Truth
Each playbook has a “Moment of Truth” (unlocked via advancement). In this dramatic scene, players get full narrative control to show off why their character embodies their archetype and to change the story fundamentally. After, one Label locks permanently, reflecting the character’s epiphany.
### 8. Advancement & Growth
Characters mark potential on misses. After five misses, they earn an “advancement” (new move, Label shift, or unlocking their Moment of Truth). After five core advancements, characters can take adult moves, switch playbooks, or retire.
## Playbooks (Character Archetypes)

Each playbook provides:
*   A narrative archetype,  
*   A set of abilities/powers,  
*   Unique moves, extras, and backstory questions,  
*   A specific relationship prompt (“When our team first came together...”),  
*   Influence assignment rules.  
**The core playbooks include:**
1.  **Beacon**: A hopeful, “ordinary” hero who compensates with gadgetry or minor powers; focused on drives (small personal goals) and proving they belong on the team.
2.  **Bull**: A tough, super-strong brawler created (or forged) for violence. Central moves focus on love, rivalry, and roles like Defender, Friend, Listener, or Enabler.
3.  **Delinquent**: A rebellious troublemaker using tricks, deception, and provoking to push boundaries. Emphasizes conflict with authority and challenging convention.
4.  **Doomed**: A powerful hero with a tragic fate (doom), tracked via a doom track and doomsigns. They wrestle with power’s cost, their nemesis, and their ultimate demise.
5.  **Janus**: A masked hero balancing normal life and superhero identity. Handles secret identities, obligations, and shifting between mundane and superheroic roles.
6.  **Legacy**: A member of a long line of heroes bound by tradition and duty. They’re judged by predecessors and must either uphold or redefine their heritage.
7.  **Nova**: The powerhouse struggling to control vast energy. Uses flares and Burn to do large-scale magic/science feats but risks collateral damage and loss of control.
8.  **Outsider**: An alien or otherworldly being trying to fit into Earth’s society. Uses advanced technology, culture clashes, and a strong sense of belonging.
9.  **Protégé**: The sidekick or trainee of an established hero, wrestling with following their mentor’s path or forging their own. Handles guidance, rebellion, and legacy.
10.  **Transformed**: Once human, now monstrous in form; deals with prejudice, isolation, and finding acceptance or embracing monstrous power.
11. **Brain**: genius, inventions, shame
12.  **Harbinger**: time-traveler (added above)
13.  **Innocent**: past self vs. feared future self
14.  **Joined**: two PCs, bonds/distinctions, power together/apart
15.  **Newborn**: created being, lessons, regeneration/damaged
16.  **Nomad**: far-traveler, “Putting Down Roots” Influence rules
17.  **Reformed**: ex-villain, obligations, low places
18.  **Scion**: villain’s child, respect tracks & lineage pressure
19.  **Soldier**: A.E.G.I.S. operative, Soldier Label & orders
20.  **Star**: audience, PR, celebrity demands
