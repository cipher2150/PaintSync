# PaintSync - Real-Time Collaborative Canvas

PaintSync is a real-time collaborative whiteboarding and drawing application designed to support simultaneous multi-user interactions. Users can draw with customizable brushes, erase elements, construct shapes (lines, rectangles, circles), track other users' dynamic cursors in real time, join dedicated rooms, and trigger individual undo/redo cycles globally without disrupting concurrent collaborators.

## 🚀 Features

- **Multi-user Real-Time Synchronization**: Connect multiple tabs/devices, see drawing additions immediately as they occur (path streaming at 60 FPS).
- **Double-Canvas Architecture**: Built with a double-layered Canvas (a persistent committed layer and a dynamic scratchpad layer) to isolate active paths and scale up frame rates.
- **Path Smoothing**: Incorporates Quadratic Bézier curve calculations to eliminate jagged strokes.
- **User-Specific Undo/Redo**: Undo/redo actions globally target your own drawings. Re-renders the board order chronologically to maintain consistency without conflict.
- **Dynamic Peer Cursors**: See active collaborator cursor positions along with their names and custom selected colors.
- **Isolated Room Channels**: Jump into different rooms (e.g. `lobby`, `design-sprint`, `retro`) for separate drawing sessions.
- **Performance HUD**: Track network latency (ping checks every 2 seconds) and rendering FPS.
- **Shape Tools**: Draw straight lines, rectangles, and circles dynamically.
- **Hotkeys support**:
  - `B` for Brush Tool
  - `E` for Eraser Tool
  - `L` for Line Tool
  - `R` for Rectangle Tool
  - `C` for Circle Tool
  - `T` for Triangle Tool
  - `X` for Text Tool
  - `Ctrl + Z` / `Cmd + Z` for Undo
  - `Ctrl + Y` / `Cmd + Y` for Redo

---

## 🛠️ Installation & Setup

Ensure you have [Node.js](https://nodejs.org/) installed (v18+ recommended).

1. Clone or download this repository to your computer.
2. Navigate to the project root directory:
   ```bash
   cd Board
   ```
3. Install all dependencies:
   ```bash
   npm install
   ```
4. Build the application and start the production server:
   ```bash
   npm run build && npm start
   ```
5. Open your browser to: [http://localhost:3000](http://localhost:3000)

### 🧑‍💻 Development Mode

If you'd like to make edits or inspect logs, you can run the hot-reloading development servers:
```bash
npm run dev
```
This runs the TypeScript Express server (port `3000`) and the Vite bundler (port `5173`) concurrently. Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 👥 How to Test Multi-User Behavior

To see the real-time sync and collaboration features in action:
1. Open [http://localhost:3000](http://localhost:3000) in your primary browser.
2. Enter a username (e.g., `Alice`), select a room code (e.g. `design`), choose a cursor color, and click **Enter Canvas Room**.
3. Open a **new Incognito/Private window** (or a different browser like Safari or Firefox) and navigate to the same URL: [http://localhost:3000](http://localhost:3000).
4. Enter a different username (e.g., `Bob`), enter the *same* room code (`design`), choose a different cursor color, and click **Enter Canvas Room**.
5. Arrange the browser windows side-by-side:
   - Move your mouse in one window: see the colored cursor follow it smoothly in the other window.
   - Start drawing: watch the line stream in real time.
   - Perform an **Undo**: notice how only the undoing user's line disappears, even if the other user drew a line afterwards, and the canvas remains perfectly identical.

---

## 🛡️ Known Limitations / Assumptions

- **Canvas Dimensions**: The virtual canvas is locked to $2000 \times 2000$ pixels. While CSS scales the canvas bounding boxes to fit browser layout viewports, drawing strokes will stretch if aspect ratios diverge significantly (a 1:1 square canvas container is enforced in CSS to prevent distortion).
- **Persistent Data Storage**: Drawing histories are currently retained in the server's Node.js memory. Restarting the server resets the canvas rooms. (Can be scaled to load/persist to databases in the future).
- **Undo Stack Size**: Server stores historical drawing strokes arrays. For extremely long collaborative sessions (tens of thousands of strokes), full canvas redrawing on undo/redo will trigger heavier CPU spikes. A bounding history window (e.g., compaction/rasterization) would be required for extreme scaling.

---


