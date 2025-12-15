# Touhou Cards V3

Touhou Cards V3 is a browser-based deck experience that mixes visual flair with flexible multiplayer tooling. Launch the live build at [Touhou Cards V3](https://lightbulb128.github.io/touhou-card-player-v3/) or jump directly into presets:

- [Base URL](https://lightbulb128.github.io/touhou-card-player-v3/)
- [Glitch effect](https://lightbulb128.github.io/touhou-card-player-v3/?g=1)
- [Chinese locale](https://lightbulb128.github.io/touhou-card-player-v3/?locale=zh)
- [English locale](https://lightbulb128.github.io/touhou-card-player-v3/?locale=en)
- [Use R2 bucket for cards rendering](https://lightbulb128.github.io/touhou-card-player-v3/?r2=1). We use Github Pages images by default.

## Running

### Development
1. Install dependencies: `npm install`
2. Start the dev server with hot reload: `npm run dev`
3. Visit http://localhost:3000 and iterate inside the `app/` directory.

### Build & Preview
1. Produce an optimized bundle: `npm run build`
2. Preview the production build locally: `npm run start`

## Playing
- **Play tab**: Queue characters; Click any card in the queue to temporarily disable it without losing your ordering.
- **List tab**: Rapidly filter and jump between every available character for quick playing.

## Config
- Swap between multiple card collections to your liking.
- Choose where music loads from.
- Load predefined music presets choose musics you like.
- Override the soundtrack for any single character when you need a custom anthem.

## Game Matching
- **Single practice**: Solo sandbox with instant resets for testing lineups.
- **CPU opponent**: Battle an automated rival to keep skills sharp offline.
- **Remote opponent (WebRTC via PeerJS)**:
  - One player acts as server, sharing a join code for another player to connect.
	- Settings sync automatically on connection and again when the game begins.
	- Set your display name so friends can find you in the lobby list.
	- Card handoffs are resilient, ensuring transfers finish even on unstable links.

## More Features
- Local storage keeps visual settings, playlists.
- Built with Next.js, React 19, and MUI 7 for fast UI iteration and theme consistency.
