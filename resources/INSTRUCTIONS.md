FIX THE FOLLOWING BUGS:
- MISSING FEATURE: The "Aid" feature isn't working for players. Clicking the advantage button on a turn card of another player. This should have a disabled state if team points have been depleted or the player has been downed.
- MISSING FEATURE: Players marking Action aren't actually registering/taking their turn in the system!
- Cooldown bars should progress the opposite direction - RIGHT TO LEFT as they drain down. IMPORTANT, these bars should be animated so they smoothly drain with a css animation when applicable.
- When adding Forward to yourself, or when the GM does it, do not deduct team. Otherwise, make sure `@UUID[Compendium.masks-newgeneration-unofficial.moves.H7mJLUYVlQ3ZPGHK]{Aid a Teammate}` is appended to the message sent out to the chat.
- The "Aid" feature where a player can add forward to another character by spending a team point is broken. The click is a no-op even if the player does have team to spend... fix this.
The javascript for turn-cards is also extremely messy and convoluted due to lots of iteration, please simplify.

You have permission to substantially refactor and simplify if that will make this cleaner and fix the critical bugs.

Output the fully revised code (ALL OF IT). No need to re-output other unrelated scss styles, but all of the styling pertaining to turn cards - yeah, reoutput it all.
