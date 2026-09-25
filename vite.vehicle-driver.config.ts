import { defineConfig } from 'vite';

/**
 * Cena de validação do piloto no veículo (SPEC-0275). GLBs de teste vão em
 * `examples/vehicle-driver/public/` (o `publicDir` padrão da raiz).
 */
export default defineConfig({
  root: 'examples/vehicle-driver',
});
