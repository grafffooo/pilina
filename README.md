# CutList Next

Rebuild of CutList Optimizer: a Rust cutting engine, plus a web app that installs as a PWA. See [PLAN.md](PLAN.md) for goals, architecture and milestones.

```
crates/cutlist-core   optimizer, pricing, statistics (pure Rust)
crates/cutlist-wasm   WebAssembly bindings used by the web app
crates/cutlist-cli    `cutlist job.json` → plan JSON
web/                  React + TypeScript + Vite PWA
desktop/              Tauri shell: the web app as a standalone Mac app
```

## Prerequisites

- Rust (stable) with the `wasm32-unknown-unknown` target, plus `wasm-pack`
- Node.js 22+

## Commands

```bash
cargo test --workspace --release           # engine tests (property tests run 256 random jobs)
PROPTEST_CASES=10000 cargo test --release   # …or many more
cargo clippy --workspace --all-targets      # engine lint
cargo bench -p cutlist-core                 # benchmarks
cargo run --release -p cutlist-cli -- job.json          # optimize a job file, print the plan
cargo run --release -p cutlist-cli -- --stats job.json  # one-line summary instead

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
npm run app        # release build: target/release/bundle/macos/CutList.app and bundle/dmg/*.dmg
npm run app:dev    # development: opens the app window on the Vite dev server, with live reload
```

The app is the same web app in a native window (Tauri, macOS WebKit), with no server. Its data lives in the app's own storage on the Mac, separate from any browser; move projects between them with "Export project file" and "Import projects…". Inside the app, files are saved through the native Save dialog and labels print through the native print panel.
