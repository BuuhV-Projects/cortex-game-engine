// Entry point lógico do app, separado do `main.rs` para casar com o padrão
// Tauri 2 (o `Cargo.toml` declara um crate `lib` reutilizável). Mantém
// a porta aberta para futuras plataformas (mobile) que invocam `run()`
// sem um binário próprio.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Em builds com a feature `devtools` (gerados via `yarn tauri:build:debug`
    // pelo botão "Gerar instalador (debug)" da IDE), abre o painel de
    // DevTools automaticamente ao subir a janela. Em release default o
    // bloco abaixo nem compila — sem overhead pro usuário final.
    #[cfg(feature = "devtools")]
    let builder = builder.setup(|app| {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            window.open_devtools();
        }
        Ok(())
    });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
