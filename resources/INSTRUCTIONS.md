This looks great. However, going to need some adjustments and bugfixes
- If the label requirement is undefined, it should be plotted and treated as if it does not exist. Don't even graph the labels in those cases
- Those dots on the end of the spokes - way too big. Refer to the designs it should just be enough so we can emphasize the tips of the spokes
- Animate the color changes when we reveal a call
- Instead of having a system notification with Preview Fit, just change the color of that element. It doesn't need to be a button, either, have it update dynamically.
- Exclude any players currently "Busy" (on cooldown) - don't even show them in the select list. Don't show anybody that is not in the encounter tracker / combat state either
- When the call windows open, they are way too small
- Call Requirements and "The Call" fields should be rich text
- Single select box for the call type should not be clipped/overflowing
- GM call setup has poor wrapping, is not super responsive, and takes up WAY TOO MUCH SPACE. I want this to be a super compact tool. Also, change it to be a 3 column table so everything is lined up perfectly.
- Instead of "good fit" for neutral calls, say "decent fit" and use orange
- For the messages shared in the chat, use a transparent background. Keep the border style though because that looks great.
- The stats for a call should always be visible to the GM, but NOT rendered for players
- Once the stat requirements for a call are revealed after clicking "Dispatch", please have the reveal of the result animated as if it radiated from the center (-3 or whatever the effective minimum is) to where the actual requirements are.
- Allow anybody with "Limited" ownership of these new sheets to select a hero and click dispatch (currently not working for players)


==============
PREVIOUS PROMPT (product requirements)
==============

I am running a TTRPG using Masks: A New Generation (Powered by the Apocalypse system). To facilitate this, I have implemented a foundryvtt v13 module (typescript, scss, handlebars) that implements this system as well as a few additional features.

I want to find an elegant way to combine the mechanics of Masks: A New Generation with mechanics and themes from the 2025 game Dispatch. I want to be able to have vignettes with heroes assigned. Since the Masks system is more narrative and scenario based, whereas in Dispatch you make choices and then a small group of heroes must pass a DC...

Important: do not venture too far into homebrew, use Dispatch and it's mechanics to flavor and enhance Masks / pbta, but do not change how the game is balanced or plays mechanically at a fundamental level.


=======
THE IDEA TO IMPLEMENT
Here's my high level plan and idea for how we can combine the systems:
============
Create a new type of Actor: "Call"
Top section is seen by anybody, bottom section under the fold is only viewable by GM
ANYBODY opening a sheet of this type should show the call to everybody!

Top section (visible by all, text fields editable by owner):
    Left Panel: Header: Call type (single select enum keyword like Assault, Rescue, Investigation, Social Event, Natural Disaster), name of the caller, and a quote from the call. owner editable
    Center Panel:
        - Header is the title of the call (owner editable)
        - A very large preview (label graph) of the potential outcome of the call based on the player turn card you have selected or are hovering over. Hovered player > Assigned Player
            - Assigning a player will graph their stats.
            - Once Dispatch is called, the requirements for the call are graphed in neutral color (grey) over the assigned hero's label graph (yellow). If the entire graph is within the hero's (hero's effective stat (label + forward + ongoing) meets or exceeds all labels required), the call's graph turns green. If they don't meet ANY requirements, the call's graph turns red. Otherwise, the call's graph turns orange aka yellow layered over yellow
            - When these graphs render, the spoke points (dots) in both graphs should be bigger and white.
        - Assigned Player - Multi-select field. Anybody can change this and everybody sees the latest value. Assigning a player changes the preview graph.
        - Submit button ("Dispatch").
            - Once submit is clicked, we trigger the "qualification" of the assigned player, and they are rewarded/penalized accordingly. On submit, the text Dispatch changes to "Assessing..." then shows "Great Fit" (green), "Good Fit" (blue) or Poor Fit (red) based on the result.
            If forward changes, then render green/red text saying [Assigned player] gets +-1 Forward
    Right Column: "Requirements" panel containing an unordered list of bullet points, with key phrases bolded/colored.

Bottom Section (ONLY visible to owner)
    Left: Column showing editable labels associated with the call. These are numeric inputs (can be undefined) from 1-3. Clearing a label value means it's not required, and by default all are undefined to start. E.g. a call could require Freak 2 and Savior 1.
    Center: Current effective values for the assigned player.
    Right: Difference between the requirement and the player
    Bottom below all those columns: Reveal button (which shows if they will pass/fail)

Behavior:
    To assign a player, hover over their turn card and take Action (both players and gms can do this). This should also make them the assigned player
    Once a call is qualified:
        - Matching or exceeding all stat thresholds rewards the assigned player with +1 forward
        - Failing to meet any of the thresholds penalizes them with -1 forward

Behind the scenes / process:
    After a call is qualified, the player then rolls separately (if appropriate) to narrate how they handle the call. The whole idea behind the Call actor sheet is to determine A) who is handling this and B) if they get a bonus/penalty based on their fit.

-----


Make sure everybody has viewer permissions for new sheets
Changes in the graphs should be animated, kind of like how shifting labels is animated on label graphs.
Try and reuse the existing label graph logic/styles as they are quite good. This should ideally be modular and general purpose code as graphing labels is a very common use case in our UI.
DO NOT CAUSE ANY REGRESSIONS IN LABEL SHIFTING ANIMATIONS/BEHAVIOR/RENDERING, OR TURN COOLDOWN TRACKING.


==============
INFO ABOUT THE VIDEO GAME THAT INSPIRED THIS
==============
Dispatching
Sign in to edit
Dispatch Robert working
One of the core game mechanics in Dispatch is effectively and quickly dispatching heroes to help around the city.


Contents
1	Overview
1.1	Answering calls
1.2	Competing calls
1.3	Hack calls
2	Assigning heroes
3	Stats
4	Intervening
5	Scoring
6	Reviewing
7	Trivia

Unmute

Advanced Settings

Fullscreen

Pause

Rewind 10 Seconds

Up Next




Overview
As the player works a shift, they will receive various calls from SDN subscribers seeking assistance, for both small situations, like getting a balloon out of a tree, to large escalations, like rescuing people from a fire. It is the dispatcher's job will be to try and assign the best suited hero available and to make sure all calls are handled (and ideally done successfully).

Answering calls
A call coming in.
A call coming in.
1/3
When a call comes in, there will be a limited amount of time to pull it up and assign a hero. Clicking on the call will cause time will pause to allow the player to read over the briefing and see what kind of assistance they need. Keywords will stand out that indicate the optimal stat(s) needed as well as any other possible factors.

It is important to note it is not immediately necessary to assign a hero right away: the player can exit out from it to view others on the map or let time continue. A small auditory countdown rings before the call auto-fails.

Competing calls
Unlike regular calls, a set of special calls that directly conflict with each other will appear together, as indicated by a pink icon with a hand showing two talk bubbles: an X and a check mark. Like other calls, there is a countdown on which one to pick, but unlike regular calls, the player can only pick one option, with the other going away once a decision is dispatched. In these situations, the reward for each choice will be shown in the briefing (such as XP for a particular hero if they're sent vs. some XP split across the entire Z-Team).

Hack calls
Occasionally, the player receives a call where no heroes are dispatched, but Robert must hack in order to resolve the call.

Assigning heroes
When a call comes in, the player will need to select a hero from the available roster and dispatch them. Certain calls may allow assigning more than one hero, though it is possible to still send fewer than allowed, particularly if their powers add some benefit to this setup (such as Invisigal's allowing her to work faster alone).

When a hero is assigned, their status will change to "busy" as they make their way there and complete the task. Afterwards, they'll change to "returning" as they head back to SDN's HQ. Once back, they'll enter a small "resting" period where they can't be assigned out until they've recovered. A draining green meter above a hero's profile indicates how much time is left before they are ready again. The player needs to review the results of the call before the hero dispatched on that can be assigned out again as well (even if they've recovered).

Calls will come in throughout the shift, often overlapping with others. As heroes need time to rest after they return to SDN's HQ, this means the optimal hero may not be available in time if already out on a call, returning, or resting. This creates a balancing between accepting calls near expiration to wait for the appropriate hero to be available or compromising and using other heroes that may still get the job done.

There are certain calls where a hero may ask to be assigned specifically and will remember if allowed to be dispatched or not, given that they are available at the time of accepting the call. Other times, a hero will automatically take a call for themselves to handle, unable to be removed.

Stats
To read more about stats, see the Stats page.
Each hero and call will rely on stats to help determine the outcome. These stats are: Combat, Intellect, Vigor, Charisma, and Mobility. It is usually impossible know the full extent of the stats needed for a situation, but the information highlights keywords to determine the best suited hero for the job. For example, convincing a group of people typically requires for high intellect and charisma over mobility and vigor.

When a call allows more for than one hero to be dispatched, the stats of all of the dispatched heroes will be summed for bigger stats and increased chances of success.


Advertisement
Intervening
In certain situations, the player will be alerted to an assigned call that needs the dispatcher's attention, as indicated by a red hand stop sign. This also has a countdown.

For these, the hero needs the player to pick an option on how to proceed in the situation. Picking on an option will focus on a single stat rather than the sum of all stats to determine the chance a mission succeeds.

There are also certain calls that allow a certain hero to resolve it themselves if that hero was chosen to be dispatched on that call.

Scoring
After a hero finishes a call, the player will need to review it before the heroes that were dispatched on that call can be assigned again after resting. Depending on the type of call and situation, there are several different ways in how an outcome is decided.

For basic situations where the stat chart is shown in full when reviewing, the call's chart appears in white before the assigned hero's/heroes' overall stats overlaps it in orange. If the call's chart fits perfectly within the hero's chart, it'll give a 100% and be successful. Otherwise, the score is calculated by how much overlap there is and then a moving marker that bounces around the call's white outlined area. If it lands on an overlapping area with the hero's, it'll be successful. Otherwise, if it lands in an area where the hero's chart doesn't overlap it, it'll fail. This can lead to some risky chances as a hero in one playthrough may succeed while in another, fail.

For situations where intervention was required, these will instead rely on one particular stat related to the scenario. When picking an option on how to proceed, the call will show the state needed to be successful before the hero's stat appears. If the hero's/heroes' chosen state matches or exceeds the call's number, it will be successful.

In intervening situations where hero-specific choices are available, this will result in a fixed result, usually successful, without the need to check the hero's stat. However, conversely, some missions that allow a certain hero to resolve it may result in an automatic failure, such as sending Flambae to take out a fire or sending Waterboy to stop a flooding, both who can create the element they are associated with but not absorb it.

No matter how it's scored, if successful, the hero(es) that were assigned see an immediate XP reward, indicated by a number that appears for a brief time over the star icon on their profile picture. Heroes also receive XP from calls they were dispatched on, but have an interference where the option chosen was to hack.

Single stat scoring from the demo
Single stat scoring from the demo
Failed call example from the demo
Failed call example from the demo
Perfect call example from the demo
Perfect call example from the demo
Hero-specific option is successful from the demo
Hero-specific option is successful from the demo

Advertisement
Reviewing
At the end of each shift, the game would review the player's performance by tallying successful, failed, and missed calls during the shift.

Having heroes succeed in more missions will increase Robert's rank as a dispatcher; higher ranks come with benefits, such as access to a bandage to heal an injured hero and a defibrillator to recover a downed hero.

Trivia
If Malevola is sent to hero training, one of the possible abilities the player can choose for her to gain is the ability to show the stats needs to pass a mission after having healed another hero previously.
Categories
Community content is available under CC-BY-SA unless otherwise noted.
----------------
Stats
1
Sign in to edit
Dispatch stats chart
Stats are the main mechanic that decides the outcome of a call in Dispatch.


Contents
1	Overview
2	Upgrading
3	Dispatching outcomes
4	Injuries
Play VideoBrand logo




Overview
There are 5 stats in the game:

Dispatch icon combat Combat
Dispatch icon intellect Intellect
Dispatch icon vigor Vigor
Dispatch icon charisma Charisma
Dispatch icon mobility Mobility
Each of these stats affect how a hero is likely (or unlikely) to succeed in an assigned call. As a hero levels up, Skill Points are earned to help increase these stats.

Upgrading
After a hero levels up, you can then go into the hero database (the folder icon on the right of the map) and view the "Upgrade" tab (top left) to select what to increase. Note that once you confirm a change, this cannot be reverted.

All heroes reach level 2 at 1000 gained XP, and every subsequent level has an added 300 XP to reach. The only exceptions being Invisigal, who reaches level 2 at 700 and Waterboy who reaches level 2 at 400.

Dispatching outcomes
Each hero and call will rely on stats to help determine the outcome. You won't know the full extent of the stats needed for a situation, so you need to carefully assess the information/keywords it provides to determine the best suited hero for the job.

With certain calls where you can send more than one hero, the stats will be combined to get bigger stat numbers and potentially a better outcome.

Injuries
Sometimes, if a hero fails at a call, they can be injured. If this happens, all their stats will decrease by 1. Injuries can also stack such that if they're still injured and they get injured again, they'll become downed.

--------------------
Synergy
3
Sign in to edit
This article is about the gameplay mechanic. For the episode, see Synergy (episode).
Synergy is a gameplay factor that allows for a major increase in success chance when certain heroes are sent together in Dispatch. It is available beginning the second dispatch in episode 3.


Contents
1	Gameplay
2	Synergy Pairs
3	Effects
4	Gallery
Play Video




Ad: (6)
5
Gameplay
After Robert berates the Z-Team for sabotaging each other to avoid being cut for underperforming, the player can pair up certain characters up during the second shift that day to increase the chances a mission succeeds. These pair also not sabotage each other when sent together during the first shift.

After activating synergy for the first time, synergistic pairs will increase the chances of a mission passing by 5%, up to 15% at max level (3); synergy levels can be increased by sending synergy pairs out together as much as possible.

This can be used when their combined stats alone do not suffice to cover all the required stats to pass the mission without fail. For example, if a synergy pair whose synergy level stands at level 2 is dispatched on a mission, and the pair's stats only cover 90% of the required stats, their synergy level will increase the chance of success by 10%, effectively making the chance 100% and skipping the success check.

Synergy Pairs
Currently, there are eight combinations of characters that will result in synergy. The first initial four are:

Golem and Invisigal
Prism and Flambae
Malevola and Sonar
Punch Up and Coupé
The fifth replacement pair is dependent on the member the player cuts in Episode 3 and the member the player adds to the Z-Team in Episode 4. See "effects below" for more info.

Malevola and Phenomaman
Malevola and Waterboy
Punch Up and Phenomaman
Punch Up and Waterboy
Phenomaman and Blonde Blazer were originally a synergistic pair during the final dispatch, but this has been patched out.

Effects
At the end of Episode 3, the player must choose to let go of either Coupé or Sonar. Whoever is chosen, their closest comrade (Punch Up or Malevola respectively) will act out in the following episode by pulling a prank, refusing to take certain calls, making snide remarks, before eventually leaving early for the first shift.

Before the second shift, Blonde Blazer presents Robert two choices to pick from to add to the team: Phenomaman or Waterboy. Whoever the player picks will then fill in as the new synergistic partner for whichever team member (Punch Up or Malevola) lost theirs.
