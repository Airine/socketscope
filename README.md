# SocketScope

> Remote control any webpage via WebSocket. A Chrome Extension + Dashboard for real-time browser session sharing.

## Features

- **Chrome Extension** — Injects a floating control bar onto any webpage
- **WebSocket Tunnel** — Persistent bidirectional connection with auto-reconnect
- **Remote Commands** — Navigate, click, type, scroll from anywhere
- **Command Audit** — Full logging and history of every remote action
- **Real-time Dashboard** — Monitor sessions, latency, and peer connections
- **Secure by Default** — Command whitelist, session isolation

## Architecture

```
┌──────────────┐      WebSocket       ┌──────────────┐
│   Chrome     │ ◄──────────────────► │   Hono +     │
│  Extension   │                      │   tRPC API   │
│  (content)   │                      │   (ws hub)   │
└──────────────┘                      └──────────────┘
       │                                      │
       │ Shadow DOM UI                        │ tRPC queries
       │                                      ▼
       │                               ┌──────────────┐
       │                               │   React      │
       │                               │  Dashboard   │
       │                               └──────────────┘
       │
       ▼
┌──────────────┐
│  Background  │
│  (WS client) │
└──────────────┘
```

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS + shadcn/ui + Recharts
- **Backend**: Hono + tRPC + WebSocket (ws)
- **Database**: MySQL + Drizzle ORM
- **Extension**: Chrome Manifest V3 + Shadow DOM

## Quick Start

```bash
# Install dependencies
npm install

# Push database schema
npm run db:push

# Start dev server
npm run dev
# Web: http://localhost:3000
# WebSocket: ws://localhost:3001/ws

# Build Chrome Extension
npm run build:extension
# Load dist/extension/ in chrome://extensions (Developer Mode)
```

## Extension Shortcuts

| Key | Action |
|-----|--------|
| `Alt+S` | Toggle control bar |
| `Alt+C` | Focus command input |
| `Alt+D` | Disconnect session |
| `Esc` | Collapse panel |

## License

MIT
