import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function checkAuth(): void {
    if (process.env.ANTHROPIC_API_KEY) {
        console.log("[auth] usando ANTHROPIC_API_KEY (API da Anthropic — consome creditos)");
        return;
    }
    const credsPath = join(homedir(), ".claude", ".credentials.json");
    if (existsSync(credsPath)) {
        console.log("[auth] usando credencial do Claude Code (subscription)");
        return;
    }
    console.error(
        [
            "Nenhuma credencial encontrada.",
            "  Opcao A (recomendada): rode 'claude login' para usar sua subscription.",
            "  Opcao B: defina ANTHROPIC_API_KEY no .env (consome creditos da API).",
        ].join("\n")
    );
    throw new Error(
        "Nenhuma credencial de autenticação encontrada. " +
        "Rode 'claude login' para usar sua subscription, ou defina ANTHROPIC_API_KEY no .env para usar a API (consome creditos)."
      );
}
checkAuth();