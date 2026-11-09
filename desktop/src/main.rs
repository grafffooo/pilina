//! CutList desktop: a native window around the web app in `web/`.
//! All app logic lives in the web app and the Rust engine (`cutlist-core`, run as WebAssembly).

// No console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        // Save dialogs and file writes for PDF and project exports.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running CutList");
}
