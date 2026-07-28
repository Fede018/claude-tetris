# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Vanilla JS Tetris implementation. No build system, no package manager, no dependencies — three static files (`index.html`, `style.css`, `game.js`) served or opened directly.

## Running the game

```bash
start index.html          # Windows: open directly
python3 -m http.server 8000   # or serve locally, then open http://localhost:8000
```

There is no build, lint, or test tooling in this repo — changes to `game.js` take effect on page reload.

## Architecture

All game logic lives in `game.js` as module-level state and top-level functions (no classes, no build step, no modules/imports).

- **Board model**: `board` is a `ROWS × COLS` matrix (`createBoard`), each cell either `0` (empty) or a piece-color index `1–7`.
- **Pieces**: `PIECES` are hardcoded square matrices (4×4 for I, 2×2 for O, 3×3 for the rest). Rotation is computed geometrically in `rotateCW` (transpose + reverse rows), not via precomputed rotation states.
- **Wall kicks**: `tryRotate` attempts the rotated shape at offsets `[0, -1, 1, -2, 2]` and keeps the first that doesn't collide.
- **Collision**: `collide(shape, ox, oy)` is the single source of truth for "can this shape sit here" — used by movement, rotation, ghost-piece projection, and spawn checks alike.
- **Game loop**: `loop(ts)` runs via `requestAnimationFrame`, accumulates elapsed time in `dropAccum`, and drops the piece one row once `dropAccum >= dropInterval`. `dropInterval` shrinks as level increases (`max(100, 1000 - (level-1)*90)`).
- **Locking a piece**: `lockPiece` → `merge` (bake shape into `board`) → `clearLines` (scan bottom-up, splice full rows, unshift empty ones at top, update score/level/dropInterval) → `spawn` (promote `next` to `current`, generate new `next`, check game-over via `collide` on spawn position).
- **Ghost piece**: `ghostY` projects the current piece straight down until it would collide, used both for the translucent ghost preview and reused as the landing row for hard drop.
- **Rendering**: `draw()` clears and redraws grid + board + ghost + current piece every frame; `drawNext()` renders the preview canvas separately. `drawBlock` is the shared per-cell renderer for both canvases.
- All UI text (labels, overlay messages) is in Spanish; keep new user-facing strings consistent with that.

## Tuning constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS×BLOCK` × `ROWS×BLOCK`).
