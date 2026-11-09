# Pilina

A workshop app for sheet goods: cut plans, material library and project costs, a step-by-step cutting guide, and an offcut library with QR labels. It started as a rebuild of CutList Optimizer. The name is Slovak and Czech for a single grain of sawdust: the smallest thing a cut leaves behind.

Under the hood: a Rust cutting engine, plus a web app that installs as a PWA and runs as a Mac app. See [PLAN.md](PLAN.md) for goals, architecture and milestones.

```
crates/pilina-core   optimizer, pricing, statistics (pure Rust)
crates/pilina-wasm   WebAssembly bindings used by the web app
crates/pilina-cli    `pilina job.json` → plan JSON
web/                  React + TypeScript + Vite PWA
desktop/              Tauri shell: the web app as a standalone Mac app
```

## Repository

- **Working copy:** `~/Developer/pilina` on the Mac. Keep it out of the iCloud-synced Desktop and Documents folders: iCloud sync and git repositories don't mix well, and an earlier copy in Documents was lost that way.
- **Remote:** private GitHub repository [`grafffooo/pilina`](https://github.com/grafffooo/pilina) (`origin`). Push after every commit, so GitHub always holds a full copy.
- **History:** the commits for milestones 0–5 were rebuilt on 9 Nov 2026 from Claude Code's session log after the original folder was lost. Content and messages match the originals; commit IDs differ.

To set up on another Mac:

```bash
git clone https://github.com/grafffooo/pilina.git ~/Developer/pilina
cd ~/Developer/pilina/web && npm install && npm run dev
```

**Old names kept on purpose:** the browser storage keys (`cutlist.*`), the IndexedDB database (`cutlist`), the Mac app's bundle identifier (`app.cutlist.desktop`) and the project file format tag (`cutlist-project`) still carry the old name. Changing them would hide projects saved before the rename. Older `.cutlist.json` files still import.

## Prerequisites

- Rust (stable) with the `wasm32-unknown-unknown` target, plus `wasm-pack`
- Node.js 22+
- For the Mac app: Xcode Command Line Tools (`xcode-select --install`)

## Commands

```bash
cargo test --workspace --release           # engine tests (property tests run 256 random jobs)
PROPTEST_CASES=10000 cargo test --release   # …or many more
cargo clippy --workspace --all-targets      # engine lint
cargo bench -p pilina-core                 # benchmarks
cargo run --release -p pilina-cli -- job.json          # optimize a job file, print the plan
cargo run --release -p pilina-cli -- --stats job.json  # one-line summary instead

cd web
npm install
npm run dev        # builds the engine to WASM, then starts Vite
npm test           # unit tests
npm run lint
npm run build      # production build (PWA) in web/dist
```

## Mac app

```bash
cd web
npm run app        # release build: target/release/bundle/macos/Pilina.app and bundle/dmg/*.dmg
npm run app:dev    # development: opens the app window on the Vite dev server, with live reload
```

The app is the same web app in a native window (Tauri, macOS WebKit), with no server. Its data lives in the app's own storage on the Mac, separate from any browser; move projects between them with "Export project file" and "Import projects…". Inside the app, files are saved through the native Save dialog and labels print through the native print panel.
