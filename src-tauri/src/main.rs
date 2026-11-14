// File: src-tauri/src/main.rs
// Version: 1.1.0
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Small Hotel Room desktop application");
}
