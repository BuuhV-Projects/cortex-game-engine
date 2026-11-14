// Tipos das pastas soltas do export (SPEC-0733), pro teste em TS.
export function looseDirsOf(config: { looseDirs?: unknown }): string[];
export function copyLooseDirs(gameDir: string, dist: string, dirs: string[]): { dir: string; files: number }[];
export function copyLanguages(gameDir: string, dist: string): number;
