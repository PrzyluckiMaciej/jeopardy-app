# Jeopardy

A browser-based, peer-to-peer Jeopardy-style party game. No account required — create a room, share a code, and play. Game state syncs directly between players using WebRTC via Nostr relays.

## Features

- **Host a game** — generate a room code, build or load boards, and control every phase of play
- **Join from any device** — players enter their name and a 6-character room code to connect instantly
- **Board editor** — create custom boards with categories, clues, answers, optional image/audio/video per question, and a designated Daily Double cell
- **Games** — group multiple boards into a named game; play through them in order with transition animations and a podium finish
- **Real-time buzzer** — players buzz in and the host sees a live queue; incorrect answers cycle to the next buzzer
- **Board control** — one player is designated to trigger Daily Doubles; correct answers pass control to the winner
- **Daily Double** — wager flow where the board-control player bets before the clue is revealed
- **Staged reveals** — clue text and attached media can be revealed separately before buzzing opens
- **Synced media playback** — host controls audio/video playback for all connected players
- **Scoring** — automatic point tracking with configurable deductions and negative scores
- **Emoji reactions** — players send quick reactions from the scoreboard
- **Persistent boards** — boards and games are stored in `localStorage`; media blobs live in IndexedDB
- **Reconnect** — players can rejoin with the same display name; duplicate names are rejected

## Privacy & data

| Stays local / P2P | Sent to third parties |
|---|---|
| Board content, clues, answers, media blobs | Anonymous analytics events (Vercel Analytics) |
| Live game state (WebRTC between browsers) | Optional server logs: role, room code, actor name, event label (`api/log`) |

Clue text, answers, and media never leave the peer group except as part of normal P2P sync. Telemetry contains no game content — only coarse event names like "Room created" or "Board reset".

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 19, Tailwind CSS 4, lucide-react |
| Routing | React Router 7 (lazy-loaded host/player pages) |
| Build | Vite 8, TypeScript |
| State | Zustand 5 |
| Networking | Trystero 0.24 + `@trystero-p2p/nostr` (P2P over Nostr relays) |
| Local storage | `localStorage` (boards & games), `sessionStorage` (session), Dexie / IndexedDB (media blobs) |
| Testing | Vitest, Testing Library, jsdom |
| Deployment | Vercel (static SPA + serverless `api/log`) |

## Architecture

The app is a static SPA. Real-time multiplayer is handled by **Trystero**, which brokers WebRTC connections through public Nostr relays using the room code as a shared key. Once peers are connected, game messages travel directly between browsers. Media attachments are transferred peer-to-peer via a separate binary channel (`MEDIA_MANIFEST` / `MEDIA_ACK` / `MEDIA_REQUEST`).

```
src/
├── main.tsx                    # Entry point (Vercel Analytics + Speed Insights)
├── App.tsx                     # Routes: /, /host, /play (host & play lazy-loaded)
├── types/index.ts              # Domain types + NetMessage union
├── store/gameStore.ts          # Zustand: persisted boards/games + live game state
├── hooks/
│   └── useOverlayTextFontSize.ts
├── lib/
│   ├── network.ts              # Trystero room wrapper (msg + media channels)
│   ├── db.ts                   # Dexie IndexedDB for media blobs
│   ├── mediaCache.ts           # Player-side media blob cache
│   ├── mediaType.ts            # MIME → media type helpers
│   ├── duplicateBoard.ts       # Deep-copy a board with media
│   ├── playerJoin.ts           # Join / reconnect / name-collision logic
│   ├── overlayTextFit.ts       # Auto-sizing clue text
│   ├── logger.ts               # Analytics + server log helper
│   └── utils.ts                # IDs, room codes, default board
├── pages/
│   ├── LandingPage.tsx         # Host / join entry point
│   ├── HostPage.tsx            # Game control, board picker, question overlay
│   └── PlayerPage.tsx          # Player buzzer, clue view, Daily Double wager
└── components/
    ├── BoardEditor.tsx         # Category / clue / media editing
    ├── GameBoard.tsx           # Shared board grid (host + players)
    ├── QuestionOverlay.tsx     # Host full-screen clue UI
    ├── QuestionOverlayText.tsx # Auto-fitting clue text
    ├── QuestionMediaPlayer.tsx # Synced audio/video player
    ├── PlayerActionZone.tsx    # Player buzz button and feedback
    ├── SettingsPanel.tsx       # Game settings and player management
    ├── Scoreboard.tsx          # Live scores, buzz queue, emoji reactions
    └── Podium.tsx              # End-of-game top-3 display

api/
└── log.ts                      # Vercel serverless endpoint for event logging
```

### State

Two Zustand stores live in `src/store/gameStore.ts`:

- **`useBoardStore`** — persisted to `localStorage` (`jeopardy-boards`); holds saved **boards** and **games** (ordered collections of board IDs).
- **`useGameStore`** — live game state in memory; **session** fields (`roomCode`, `isHost`, `myPlayerId`) persisted to `sessionStorage` so refreshes don't drop the room.

### Network messages

The host is the single source of truth. It broadcasts `SYNC_STATE` on every significant change and sends it unicast to each new joiner. Other message types carry individual game events:

`PLAYER_JOIN` · `PLAYER_LEAVE` · `JOIN_REJECTED` · `OPEN_CARD` · `CLOSE_CARD` · `REVEAL_CLUE` · `REVEAL_MEDIA` · `START_BUZZING` · `BUZZ` · `JUDGE` · `REVEAL_ANSWER` · `MARK_ANSWERED` · `UPDATE_PLAYER` · `REMOVE_PLAYER` · `SET_BOARD_CONTROL` · `UPDATE_SETTINGS` · `MEDIA_MANIFEST` · `MEDIA_ACK` · `MEDIA_REQUEST` · `MEDIA_PLAYBACK` · `DAILY_DOUBLE_REVEAL` · `DAILY_DOUBLE_BET` · `DAILY_DOUBLE_ACCEPT_BET` · `DAILY_DOUBLE_REVEAL_CLUE` · `EMOJI_REACT`

### Game phase flow

```
lobby → gameStart → board → question → buzzing → revealed → board → …
                              ↘ dailyDouble → dailyDoubleBet → …
… → podium (after last board in a multi-board game)
```

Selecting a single board skips `gameStart` and goes straight to `board`.

## Getting Started

Requires **Node 20+**.

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Hosting a game

1. Click **Host a game** on the landing page — a 6-character room code is generated automatically.
2. In the host view, open the board picker to **select a game** (multi-board session) or **pick a single board**. You can also create or edit boards in the editor.
3. Share the room code with players. They go to the landing page, enter their name and the code, and click **Join game**.
4. For a multi-board **game**, click **START** on the game-start screen. For a single board, play begins as soon as the board is selected.
5. Click any dollar-value cell to open a clue. Use the question overlay to reveal clue/media, open buzzing, judge answers, and mark the clue as answered.
6. When all boards in a game are finished, the **podium** shows the top three players.

### Joining a game

1. Enter your name and the room code on the landing page, then click **Join game**.
2. Wait for the host to open a clue, then tap **Buzz** when ready to answer.
3. If you have **board control** and land on a Daily Double, you'll be prompted to enter a wager.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR to `main`: type-check, lint, test, and build.

## Deployment

The build output in `dist/` is a static SPA. `vercel.json` rewrites all non-API routes to `index.html` and exposes the `api/log` serverless function. Deploy to Vercel, or any static host that supports SPA fallback routing.
