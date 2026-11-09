# CutList Next

Rebuild of CutList Optimizer: a Rust cutting engine, plus a web app that installs as a PWA. See [PLAN.md](PLAN.md) for goals, architecture and milestones.

```
crates/cutlist-core   optimizer, pricing, statistics (pure Rust)
crates/cutlist-wasm   WebAssembly bindings used by the web app
crates/cutlist-cli    `cutlist job.json` → plan JSON
web/                  React + TypeScript + Vite PWA
```

## Prerequisites

- Rust (stable) with the `wasm32-unknown-unknown` target, plus `wasm-pack`
- Node.js 22+

## Commands

```bash
cargo test --workspace                      # engine tests
cargo clippy --workspace --all-targets      # engine lint
cargo run -p cutlist-cli -- job.json        # optimize a job file

cd web
npm install
npm run dev        # builds the engine to WASM, then starts Vite
npm test           # unit tests
npm run lint
npm run build      # production build (PWA) in web/dist
```
