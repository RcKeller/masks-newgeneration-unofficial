Implement a simple data visualization in the place of the "Shift Labels" button. The button should not be a circle. It should be a pentagon shaped button that represents how much of the 5 main skills in the game

The spokes are as follows

Top center: DANGER
Top Right: FREAK
Top Left: SUPERIOR
Bottom Right: SAVIOR
Bottom Left: MUNDANE

The outside edges of the stats data vis should have a slightly brighter border, e.g. dull yellow with brighter yellow edges
If there is an effective bonus (Forward + Ongoing), then the graph should be BLUE instead of YELLOW. They get a bonus for the effective value added to ALL labels
If the player has taken a condition, then that portion of the graph should be RED, along with the edges of the visualization. The conditions are as follows:

Afraid: -2 Danger
Angry: -2 Mundane
Guilty: -2 Superior
Hopeless: -2 Freak
Insecure: -2 Savior

The way they're coded in the system is often these strings as well, so be prepared to match on those too
"0": "Afraid (-2 to engage)",
"1": "Angry (-2 to comfort or pierce)",
"2": "Guilty (-2 to provoke or assess)",
"3": "Hopeless (-2 to unleash)",
"4": "Insecure (-2 to defend or reject)"

The maximum effective value for any Label is 4 for ANY Label. Do not go beyond this.

If there is a negative affecting a stat while the player also has an effective bonus, prefer to show red over the color blue.

The way you code this should be scalable and reusable in different contexts - I may want to put this visualization in some other place, so prepare accordingly.

The graph is still going to be a button that opens a dialogue so implement accordingly without breaking that functionality.

Try not to keep adding to turn-cards.mjs, split that functionality and logic for this graph out into a new module file.
We shall call this the Labels Graph

A screenshot is provided, you can see an example of what the graph should look like at the bottom left of each character portrait.

============

FIX THE FOLLOWING BUGS:
- MISSING FEATURE: The "Aid" feature isn't working for players. Clicking the advantage button on a turn card of another player. This should have a disabled state if team points have been depleted or the player has been downed.
- MISSING FEATURE: Players marking Action aren't actually registering/taking their turn in the system!
- Cooldown bars should progress the opposite direction - RIGHT TO LEFT as they drain down. IMPORTANT, these bars should be animated so they smoothly drain with a css animation when applicable.
- When adding Forward to yourself, or when the GM does it, do not deduct team. Otherwise, make sure `@UUID[Compendium.masks-newgeneration-unofficial.moves.H7mJLUYVlQ3ZPGHK]{Aid a Teammate}` is appended to the message sent out to the chat.
- The "Aid" feature where a player can add forward to another character by spending a team point is broken. The click is a no-op even if the player does have team to spend... fix this.
The javascript for turn-cards is also extremely messy and convoluted due to lots of iteration, please simplify.

You have permission to substantially refactor and simplify if that will make this cleaner and fix the critical bugs.

Output the fully revised code (ALL OF IT). No need to re-output other unrelated scss styles, but all of the styling pertaining to turn cards - yeah, reoutput it all.
