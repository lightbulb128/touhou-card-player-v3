## 2026-04-17
* Update super deform card image of Narishiko and Nina in th20.

## 2026-10-14
* Restructured the project into smaller components and utility files.
* Added a "Hide Display" toggle, to allow 1v1 offline game without a judge.
* Added Th06 New Classic music support, with a new idpreset.
* Bugfix: remove "魔法少女達の百年祭" from "フランドール・スカーレット".

## 2026-10-15
* Added "霊長新益京　～ Artificial Utopia in Ruins." songs.
* Updated card of "ニナ" and "馴子".
* Adjust CPU match settings to be more realisitic.
* Added Japanese locale (`?locale=ja`, or auto-detected from the browser language).
* Added PvP join links: the server can copy a client/observer link (`?code=...&role=...`) that opens the game board with the role and share code prefilled.

## 2026-10-26
* Moved the "Hide Display" button to a row of its own on the Player tab.
* Bugfix: name plates over the collected piles now label the player they sit above: an observer no longer sees their own name on a player's plate, and every melee client sees their own name on the near side instead of the server's.
* Bugfix: a client or observer that loses the server keeps its own name in the waiting roster instead of inheriting the name of the client that sat in slot 1.
* Bugfix: "Random Fill" now draws from every character the board offers instead of a possibly stale playing order, never picks a character that is already in a deck or a collected pile, keeps trying when a candidate is refused (instead of leaving the slot empty), and greys itself out once no character is left to place.
* The "Match" tab is now offered on tablets as well as desktops, based on the screen rather than the window width; phones still hide it in both orientations.