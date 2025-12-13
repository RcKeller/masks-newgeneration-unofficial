YOUR TASK

Refactor and improve how Turn Cards render the bonus buttons, simplifying and streamlining the code. They should still be animated but the rendering should be more straightforward, using flexbox rows and columns instead of relative positioning that is difficult to maintain

Abstract out that functionality to a dedicated file, resource-trackers.mjs

Potential and Advantage (Forward/Ongoing) are 2 examples of trackable resources, but there are several playbook exclusive resources I want you to render too. Specifically:

- Bottom left: Every player should have the shift labels button, and the Advantage tracker on top of it
- Bottom right: Every player needs the Potential Tracker

During your refactor, implement the following quick trackers. Note, not all of these track a literal integer stat, nor will they all be interactive. These new resource trackers should be on top of either the button stack on the left, or the buttons on the right.

NEW BUTTONS TO IMPLEMENT:
Please note if called upon to roll or share an ability to chat, use the corresponding item of the same name from that actor, NOT the version from the compendium!!

Doomed (Right): Doom Track
  fa-solid fa-skull
Bull (Left): Ongoing bonus for love/rival
  fa-solid fa-skull-cow
Janus (Right): Roll "When Time Passes", a move item for this actor
  fa-solid fa-house-chimney-crack
Legacy (Right):  Roll "Whenever time passes", a move item for this actor
  fa-sharp-duotone fa-solid fa-user-group
Nova (Left): Burn tracker
  fa-solid fa-fire
Protege (Left): None
Innocent (Right): 5 steps (non-interactive, must modify from sheet)
  fa-solid fa-stairs
Beacon (Right): Drives completed thus far (non-interactive, must modify from sheet)
  fa-sharp-duotone fa-solid fa-bullseye-arrow
Joined (Right): No idea, use your best judgment, or none at all
Reformed (Right): Obligations (non-interactive, must modify from sheet)
  fa-sharp fa-solid fa-hockey-mask
Newborn (Right): Lessons completed (non-interactive, must modify from sheet)
  fa-solid fa-chalkboard-user
Star (Left): Share "Audience" move item
  fa-solid fa-star
Nomad (Right): Influence given to others (clicking shares the move item Putting Down Roots)
  fa-solid fa-street-view

Harbinger (Right): Just a button, clicking shares the move "Connecting the Dots" to chat
Scion (Right): Respect icon (click to share "Respect" chat)
Brain (Left): This playbook is MISSING a gadget tracker, add this stat as a trackable resource on the playbook (integer >0, no limit). This is based on the "Always Prepared" brain move.

Outsider: Nonee
Delinquent: None
Transformed: None


PLEASE CHANGE THE STAR icon for potential to fa-solid fa-seedling

---------

Scrutinize how all the classes work. Some playbooks, like Doomed, have a unique resource tracker. For example, gadgets for the brain, or burn/flares for Nova. Add custom buttons directly above the star for marking potential, as a tool for players to track these resources. Similar to potential, players can add/remove their own resource here or the GM can do it, otherwise it is disabled (but not greyed out) for other players. These buttons should be themed based on the class, for example the doomed should have a purple skull meter that can be incremented/decrimented similar to how we handle Potential. Be sure to peruse the resources dir closely to make sure we've accounted for them all, as many of these playbook specific features are missing.

Examples of resources to track:




=============
TRACKABLES
Not all of these are implemented as straight integers, some of them are more nuanced.
=============

## Basic Playbooks

- **The Beacon** — **Drives**
  - Min/Max: 4 drives marked at a time; when all 4 struck out, mark 4 new ones (max 3 cycles)
  - Triggers: Fulfill a marked drive → strike it out and mark potential, clear a condition, or take Influence

- **The Bull** — **The Bull's Heart** (Love & Rival)
  - Min/Max: Always exactly 1 love and 1 rival
  - Triggers: Can change at any time; +1 ongoing when acting to impress love or frustrate rival

- **The Delinquent** — *No unique resource*
- **The Doomed** — **Doom Track**
  - Min/Max: 5-box clock, resets when filled
  - Triggers: Mark when you avoid progress on defeating nemesis, overextend powers, injure innocents, face danger alone, frighten loved ones, show mercy, or talk openly about doom

- **The Janus** — **Obligations** (3 total)
  - Min/Max: 3 obligations chosen from Jobs/School/Home/Social
  - Triggers: When time passes, roll +Mundane to see how obligations fare

- **The Legacy** — **Legacy Members**
  - Min/Max: At least 4 named members (active, retired, next generation, greatest opponent)
  - Triggers: When time passes, roll +Savior based on family reactions; legacy members can never lose Influence over you

- **The Nova** — **Burn & Flares**
  - Min/Max: Hold 0-3 burn per scene; resets at end of scene
  - Triggers: Charge up powers (roll +conditions marked); spend burn to activate flares

- **The Outsider** — *No tracked resource* (has Demeanor choice affecting Influence)
- **The Protégé** — **Mentor's Resources** (3-4 items)
  - Min/Max: 3-4 selected resources (base, vehicle, gear, etc.)
  - Triggers: Available during play; mentor relationship governs access

- **The Transformed** — *No unique resource*

## HCHC Playbooks

- **The Innocent** — **Future Self's Path**
  - Min/Max: 6 steps; max 5 circled at once
  - Triggers: Learn steps through play; circle or strike out steps to unlock villain-version move options

- **The Joined** — **Bonds & Distinctions**
  - Min/Max: Start with 1 bond + "Two of a Kind"; 4 bonds available total
  - Triggers: When either player locks a Label, convert 1 bond → 1 distinction

- **The Newborn** — **Lessons** (A Blank Slate)
  - Min/Max: 4 lesson slots (2 at creation, 2 learned during play)
  - Triggers: Embody a lesson → shift Label; reject a lesson → reject their Influence

- **The Reformed** — **Friends in Low Places** (Villain Contacts)
  - Min/Max: 3 named villains, each with 4 obligation boxes
  - Triggers: Call for help (mark obligation); help them (erase 2 obligations); when time passes (roll +highest obligation)

- **The Star** — **Audience**
  - Min/Max: 2 audience advantages, 2 audience demands
  - Triggers: Accept audience feedback (clear condition) or reject it (mark potential); seek help from audience (roll +Superior)

## AEGIS Playbooks

- **The Brain** — **Your Shame**
  - Min/Max: 1 major shame (AI, weapon, monstrosity, etc.)
  - Triggers: When confronted by shame, mark condition or shift Superior down/Danger up; end of session check for making amends

- **The Soldier** — **Soldier Label** (6th stat)
  - Min/Max: -2 to +3 (starts at +2); mark condition if bounds exceeded
  - Triggers: Can never be removed except through late-game advancement; can't lock with Moment of Truth; governs A.E.G.I.S. authority moves

## Unbound Playbooks

- **The Harbinger** — **Memories Score & Timeline Names**
  - Min/Max: Memories starts at -1, +1 per name assigned (max +3 with 6 names: Monster, Traitor, Corruptor, Martyr, Architect, Leader)
  - Triggers: Push to remember (mark condition + roll) to identify future roles; Moment of Truth resets all names

- **The Nomad** — **Putting Down Roots** (Influence Limit)
  - Min/Max: Can only give out 6 Influence total (vs. unlimited normally)
  - Triggers: Give Influence only via vulnerability revelation; can take back 1 per session end; stacking benefits at 1-2, 3, 4, 5, 6 Influence given

- **The Scion** — **Respect Tracking**
  - Min/Max: 6 important NPCs, each with 4-box respect track
  - Triggers: Seek out (roll +Savior) or earn standard Influence (converts to respect mark); at 4 Respect gain +1 to a Label of their choice
