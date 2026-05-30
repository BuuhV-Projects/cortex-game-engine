// Entry point lógico do app, separado do `main.rs` para casar com o padrão
// Tauri 2 (o `Cargo.toml` declara um crate `lib` reutilizável). Mantém
// a porta aberta para futuras plataformas (mobile) que invocam `run()`
// sem um binário próprio.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
