# Jeopardy Friends

A browser-based, peer-to-peer Jeopardy-style party game. No account, no server, no data leaves your browser — game state syncs directly between players using WebRTC via Nostr relays.

## Features

- **Host a game** — generate a room code, build or load a board, and control every phase of play
- **Join from any device** — players enter their name and a 6-character room code to connect instantly
- **Board editor** — create custom boards with categories, clues, answers, and optional image/audio/video per question
- **Real-time buzzer** — players buzz in and the host sees a live queue; incorrect answers cycle to the next buzzer
- **Scoring** — automatic point tracking with optional negative points for wrong answers
- **Persistent boards** — saved boards are stored in `localStorage` and persist across sessions; media is stored in IndexedDB

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 19, Tailwind CSS 4 |
| Routing | React Router 7 |
| Build | Vite 8, TypeScript |
| State | Zustand 5 |
| Networking | Trystero 0.24 + `@trystero-p2p/nostr` (P2P over Nostr relays) |
| Local storage | `localStorage` (boards), Dexie / IndexedDB (media blobs) |

## Architecture

This is a fully static SPA — there is no backend server. Real-time multiplayer is handled by **Trystero**, which brokers WebRTC connections through public Nostr relays using the room code as a shared key. Once peers are connected, all game messages are sent directly between browsers.

```
src/
├── main.tsx              # Entry point
├── App.tsx               # Routes: /, /host, /play
├── types/index.ts        # Domain types + NetMessage union
├── store/gameStore.ts    # Zustand: persisted boards + ephemeral game state
├── lib/
│   ├── network.ts        # Trystero room wrapper (broadcast / send / hooks)
│   ├── db.ts             # Dexie IndexedDB for media blobs
│   └── utils.ts          # ID helpers, room code generator, default board
├── pages/
│   ├── LandingPage.tsx   # Host / join entry point
│   ├── HostPage.tsx      # Game control, board selection, question overlay
│   └── PlayerPage.tsx    # Player buzzer and clue view
└── components/
    ├── BoardEditor.tsx    # Category / clue / media editing
    ├── QuestionOverlay.tsx# Host full-screen clue UI
    ├── SettingsPanel.tsx  # Game settings and manual player management
    └── Scoreboard.tsx     # Live player scores and buzz queue
```

### State

Two Zustand stores live in `src/store/gameStore.ts`:

- **`useBoardStore`** — persisted to `localStorage`; holds saved boards.
- **`useGameStore`** — in-memory only; holds session info (`isHost`, `roomCode`) and live game state (`GamePhase`, players, scores, answered cells).

### Network messages

The host is the single source of truth. It broadcasts `SYNC_STATE` on every significant change and sends it unicast to each new joiner. Other message types carry individual game events:

`PLAYER_JOIN` · `PLAYER_LEAVE` · `OPEN_CARD` · `CLOSE_CARD` · `START_BUZZING` · `BUZZ` · `JUDGE` · `REVEAL_ANSWER` · `MARK_ANSWERED` · `UPDATE_PLAYER` · `REMOVE_PLAYER` · `UPDATE_SETTINGS`

### Game phase flow

```
lobby → board → question → buzzing → judging → revealed → board → …
```

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Hosting a game

1. Click **Host a Game** on the landing page — a 6-character room code is generated automatically.
2. You are taken to the host view. Use the **Board** tab to select a saved board or create a new one in the editor.
3. Share the room code with players. They go to the landing page, enter their name and the code, and join.
4. Click **Go Live** to start the game. Click any dollar-value cell to open a clue.
5. Use the question overlay to open buzzing, judge answers, and mark the clue as answered.

### Joining a game

1. Enter your name and the room code on the landing page, then click **Join**.
2. Wait for the host to open a clue, then tap the **Buzz** button when ready to answer.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

## Deployment

The build output in `dist/` is a fully static site (relative asset paths via `base: './'`). Deploy to any static host — GitHub Pages, Netlify, Vercel, etc.
