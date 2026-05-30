// Previne abrir um console preto extra junto da janela do jogo no Windows
// release builds. Em debug o console fica para facilitar troubleshooting.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    game_app_lib::run()
}
