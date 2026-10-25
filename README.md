# Touhou Cards V3

Touhou Cards V3 is a browser-based deck experience that mixes visual flair with flexible multiplayer tooling. Launch the live build at [Touhou Cards V3](https://lightbulb128.github.io/touhou-card-player-v3/) or jump directly into presets:

- [Base URL](https://lightbulb128.github.io/touhou-card-player-v3/)
- [Glitch effect](https://lightbulb128.github.io/touhou-card-player-v3/?g=1)
- [Chinese locale](https://lightbulb128.github.io/touhou-card-player-v3/?locale=zh)
- [English locale](https://lightbulb128.github.io/touhou-card-player-v3/?locale=en)
- [Japanese locale](https://lightbulb128.github.io/touhou-card-player-v3/?locale=ja)
- [Use R2 bucket for cards rendering](https://lightbulb128.github.io/touhou-card-player-v3/?r2=1). We use Github Pages images by default.

## What this is

A fan-made Touhou card game that you play by ear, bundled with a music player for the soundtrack it draws on.

- **The game.** Each turn a Touhou track starts playing. Click the card of the character that track
  belongs to — the first correct pick takes it.
- **Two ways to win.** *Classic Mode* makes a wrong pick cost you cards and is won by emptying your
  deck first; *Leisure Mode* ignores wrong picks and is won by holding more cards once the board is
  cleared.
- **Opponents.** Play solo as a sandbox, against a CPU rival whose reaction time and mistake rate
  you set, or against other players — one on one, or a multi-player melee.
- **The music player.** Queue characters and reorder, shuffle or reset that order, temporarily
  disable any of them without losing the rest, switch card art or music source, or give one
  character a custom theme. `[`, `]` and `space` drive playback from the Player and List tabs.
- **Nothing to install or host.** The deployed site is a static page: the rules run in the browser,
  matches go peer-to-peer over WebRTC (PeerJS) with one player hosting, and preferences stay in
  localStorage. Card art and music are credited in the Config tab.

## Running

### Development
1. Install dependencies: `npm install`
2. Start the dev server with hot reload: `npm run dev`
3. Visit http://localhost:3000 and iterate inside the `app/` directory.

### Build & Preview
1. Produce an optimized bundle: `npm run build`
2. Preview the production build locally: `npm run start`

### Checks
- `npm test` — unit tests (Vitest).
- `npm run test:watch` — unit tests in watch mode.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint.

## Architecture

The app is a pure front end: it fetches its data from `public/`, keeps settings in
localStorage, and uses PeerJS for multiplayer. Code is grouped by responsibility rather
than by screen.

```
app/
  page.tsx                 tab shell only: composes the two hooks below and renders tabs
  lib/                     framework-agnostic logic + hooks shared by every screen
    geometry.ts            board layout maths (computeBoardLayout, deck hit-testing, ...)
    cardImages.ts          card image urls (collection -> prefix, local or R2)
    cardState.ts           CardBackgroundState, the visual state a card is drawn in
    unusedCards.ts         the "is this card unused" rule + pile helpers
    music.ts               music lookup (musicIdFor / musicInfoFor / musicSourceFor)
    math.ts                clamp
    format.ts              clock formatting
    persistence.ts         every localStorage key, with validation
    features.ts            ?g / ?r2 / ?locale / ?cheatcode feature flags, read once
    joinLink.ts            builds and reads ?code / ?role PvP join links
    playbackActions.ts     transport rules shared by the buttons and the hotkeys
    screenClass.ts         phone vs tablet/desktop classification from the screen size
    useGameData.ts         character + music dataset, the user's selection, dataset actions
    useMusicPlayer.ts      audio engine: playback, transport, countdown bell
    usePlaybackHotkeys.ts  `[` / `]` / space on the Player and List tabs
    useAudioClock.ts       follows a track's position where it is displayed
    useVersion.ts          the render nudge used by the mutable models
    useWindowWidth.ts      responsive hooks: window width and whether the game board is offered
    fetchJson.ts           fetch + status check
  types/
    Configs.ts             GlobalData, playback settings, playing-order helpers
    GameTypes.ts           shared game value types (CardInfo, MatchType, ...)
    GameEvents.ts          the wire protocol (every Event variant)
    syncCodec.ts           encode/decode/frame validation for the wire protocol
    GamePeer.ts            WebRTC/PeerJS transport only
    GameJudge.ts           rules engine: decks, turns, picks, scoring, CPU
    Localization.ts        bilingual strings (GetLocalizedString / Localization)
  components/
    GameTab.tsx            board composition (layout + layers)
    game/
      useGameSession.ts    game state, peer wiring, effects, board actions
      useBoardSetting.ts   the persisted board shape (card width + deck size)
      useUnusedCards.ts    the unused pile, with a stable order across changes
      gameButtonModels.ts  pure start / opponent / next-turn button models
      cardVisuals.ts       pure pass that positions every card and overlay model
      cardDrag.ts          drag & drop handlers
      GameControls.tsx     deck column, middle bar, volume, opponent panel
      CardLayer.tsx        absolutely positioned cards and placeholders
      CollectedPiles.tsx   score badges, name labels, observer list
      ConnectionPanel.tsx  join/share code panel
      PlayerNameOverlay.tsx, ChatPanel.tsx, CheatOverlay.tsx, GameTimerDisplay.tsx
    PlayerTab.tsx / ListTab.tsx / ConfigTab.tsx / …   the other tabs
```

Four conventions are worth knowing when making changes:

- **`GameJudge` is one mutable model.** `useGameSession` creates it once and everything mutates
  that same object: the rules engine, the peer event handlers and the board actions. Publishing a
  change only bumps a version counter (`useVersion`), so React re-renders while every holder still
  sees the same instance. Never clone it — a second instance silently disconnects the rules engine
  from the handlers and half of every update is lost. The rules themselves are pure functions of
  the judge's fields, which is what the tests exercise.
- **The rules engine never publishes synchronously.** A rule mutates and returns (a "changed"
  flag where the caller needs one); the session layer calls `markJudgeChanged()` after invoking
  it. The single exception is the deferred next-turn timer the rules own, which has no caller on
  the stack to publish for it. This is what keeps `confirmStart()`/`addPlayer()` from freezing a
  half-updated judge into a snapshot.
- **Long-lived objects are wired after commit.** The peer callbacks and the `outerRef` hooks the
  judge calls back into are installed in effects, not during render, so the wiring order is
  explicit and a render never has side effects.
- **The outer ref is not readable during render.** Its mirrors of React state
  (`playingOrder`, `characterTemporaryDisabled`, ...) are refreshed by an effect, so during a
  render they still hold the previous commit's values. The judge reads them inside actions, which
  run after the commit; anything a render needs is passed in as an argument or a prop instead
  (`useGameSession` derives e.g. `isMusicFilteredByDeck` from the live state for this reason).
- **Board geometry is one object.** `computeBoardLayout` returns every derived coordinate
  (deck bounds, middle bar, collected rows, name plates), and `computeDeckColumnLayout` returns
  the `top` of every button in the deck column plus the cursor end the canvas has to clear.
  Components position themselves from those results instead of replaying a shared `y` cursor,
  so a layout change only has to be made in one place.


## Playing
- **Play tab**: Queue characters; Click any card in the queue to temporarily disable it without losing your ordering.
- **List tab**: Rapidly filter and jump between every available character for quick playing.
- **Match tab**: The game board. Offered on desktops and tablets; phones have no room for the
  board, so the tab stays hidden there and a PvP join link does not open it.
- **Hotkeys**: On the Play and List tabs, `[` plays the previous song, `]` the next one, and
  `space` toggles play/pause. They stay inactive while a text field has focus and while a match
  is running.

## Config
- Swap between multiple card collections to your liking.
- Choose where music loads from.
- Load predefined music presets choose musics you like.
- Override the soundtrack for any single character when you need a custom anthem.

## Game Matching
- **Single practice**: Solo sandbox with instant resets for testing lineups.
- **CPU opponent**: Battle an automated rival to keep skills sharp offline.
- **Remote opponent (WebRTC via PeerJS)**:
  - One player acts as server, sharing a join code for other players (can be 1 opponent for 1v1 or multiple for a melee mode!) to connect.
	- The server can also copy a ready-made join link for an opponent or an observer (`?code=...&role=client|observer`); opening it goes straight to the game board with the role and share code prefilled, so the recipient only clicks Connect.
	- Settings sync automatically on connection and again when the game begins.
	- Set your display name so friends can find you in the lobby list.
	- Card handoffs are resilient, ensuring transfers finish even on unstable links.

## More Features
- Local storage keeps visual settings, playlists.
- Built with Next.js, React 19, and MUI 7 for fast UI iteration and theme consistency.
