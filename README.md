# ✏️ GuessToWin

**A multiplayer online drawing-and-guessing game.** Draw, guess, and compete with friends in real time!

Built with Node.js, Express, Socket.IO, and the HTML Canvas API.

---

## Features

- **Private rooms** with shareable room codes
- **Real-time drawing** synced across all players via Canvas API + Socket.IO
- **Automatic guess detection** — just type in chat, no submit button needed
- **Progressive hints** — letters reveal over time to help guessers
- **Close-guess detection** — players are notified when they're almost right
- **Time-based scoring** — faster guesses earn more points
- **Responsive design** — works on desktop, tablet, and mobile
- **Server-authoritative** — all game logic, scoring, and validation runs on the server
- **200+ built-in words** across multiple categories
- **Anti-cheat** — drawing rate-limiting, duplicate guess prevention, answer hiding

---

## Prerequisites

- **Node.js** v16 or higher (v18+ recommended)
- **npm** (included with Node.js)

---

## Installation

```bash
# 1. Clone or download the project
git clone <your-repo-url>
cd guesstowin

# 2. Install dependencies
npm install

# 3. Start the server
npm start
