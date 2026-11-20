//! Pilina desktop: a native window around the web app in `web/`.
//! All app logic lives in the web app and the Rust engine (`pilina-core`, run as WebAssembly).

// No console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;

fn sync_folder_config(app: &tauri::AppHandle) -> Option<PathBuf> {
    Some(app.path().app_config_dir().ok()?.join("sync-folder.txt"))
}

fn read_saved_folder(app: &tauri::AppHandle) -> Option<PathBuf> {
    let cfg = sync_folder_config(app)?;
    let raw = std::fs::read_to_string(cfg).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let path = PathBuf::from(trimmed);
    path.is_dir().then_some(path)
}

#[tauri::command]
async fn pick_sync_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dialog_app = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        dialog_app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(fp) = picked else {
        return Ok(None);
    };
    let path = fp.into_path().map_err(|e| e.to_string())?;
    if let Some(cfg) = sync_folder_config(&app) {
        if let Some(parent) = cfg.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&cfg, path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    }
    app.fs_scope()
        .allow_directory(&path, false)
        .map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn remembered_sync_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    if let Some(path) = read_saved_folder(&app) {
        app.fs_scope()
            .allow_directory(&path, false)
            .map_err(|e| e.to_string())?;
        return Ok(Some(path.to_string_lossy().into_owned()));
    }
    Ok(None)
}

#[tauri::command]
fn forget_sync_folder(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(cfg) = sync_folder_config(&app) {
        match std::fs::remove_file(cfg) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        // Save dialogs and file writes for PDF and project exports.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if let Some(path) = read_saved_folder(app.handle()) {
                let _ = app.fs_scope().allow_directory(&path, false);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_sync_folder,
            remembered_sync_folder,
            forget_sync_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Pilina");
}
