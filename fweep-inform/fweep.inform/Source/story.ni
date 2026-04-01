"fweep" by Phil Riley

The story title is "fweep".
The story author is "Phil Riley".
The story headline is "A map creator".
The release number is 1.
The story creation year is 2026.

Bat Cave is a room. "A dark passage leads west.

On the north wall is a sign saying 'enter [']\create Bat Cave[']'.

On the west wall is a sign saying 'enter [']\west is unknown[']'"

	
	
Glass Maze is west of Bat Cave. "A dark passage leads east and a stairway leads up.

Scribbled on the floor are the instructions '\west of Bat Cave is Glass Maze'.

Etched in the ceiling is the inscription '\above is unknown'."

Above the Glass Maze is the Dark Corner. The Dark Corner is dark.

The description of the Dark Corner is "Now that it's light, you see that this room is little more than a nook at the top of a narrow stair. It looks like you can just squeeze through a tight crack to the north.

Smoky tendrils float through the room. You can just make out a message in them: '\above Glass Maze is Dark Corner, which is dark'"


After printing the description of a dark room:
	say "A hollow voice says 'frotz'."
	
frotzing is an action applying to nothing. Understand "frotz me/--" as frotzing.
Instead of frotzing:
	if the location is Dark Corner and the Dark Corner is dark:
		say "Behold! Now the room is lit!";
		now the Dark Corner is lit;
	otherwise:
		say "Nothing seems to happen.";
		
Treasure Room is north of Dark Corner. The description of Treasure Room is "The brillliance of this room is staggering, the light reflecting from a million coins and refracting through a thousand jewels. But you are not here for wealth, you are here for wisdom. 

A choir of a hundred angels sings '\create Treasure Room north of Dark Corner'.

A narrow crack leads south."

a jewel-encrusted book is in Treasure Room.

Instead of examining the jewel-encrusted book:
	say "
	Welcome to fweep! The map creator for people who like to type! And frankly, who hate switching from the keyboard to the mouse and back again.
	
	fweep has an interactive visual editor, but it's meant to be primarily used through the keyboard, in the same window in which you're playing a game. You may play the game normally, or input mapping commands by prefixing them with '\'. 
	
	Now enter '\put jewel-encrusted book in Treasure Room'.
	
	Here are some extra tips:
	
	* Typing Ctrl+Space while in \ mode brings up auto-suggestions.[line break]
* '\undo' is exactly what it sounds like.[line break]
* and of course, you can type '\help'.

Now go ahead and type '\choose a game'!"



