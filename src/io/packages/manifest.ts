import { z } from 'zod/v3';

/**
 * Manifesto de um pacote de textura da Cortex (`cortex-package.json`, SPEC-0641).
 *
 * Mesmo arquivo nos dois lados: no repo do pacote (com `archive`, que aponta o
 * zip do Release e o SHA-256) e dentro do zip instalado em
 * `assets/packages/<id>/` (sem `archive`). Caminhos de mapa são relativos à
 * raiz do pacote.
 */

const relPath = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..'), {
    message: 'caminho deve ser relativo, com "/" e sem ".."',
  });

const MapsSchema = z.object({
  color: relPath.optional(),
  normal: relPath.optional(),
  roughness: relPath.optional(),
  emissive: relPath.optional(),
  opacity: relPath.optional(),
});

const MaterialSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    tags: z.array(z.string()).default([]),
    size: z.number().int().positive(),
    tiling: z.number().positive().default(1),
    maps: MapsSchema,
    incomplete: z.boolean().default(false),
  })
  .refine((m) => m.incomplete || m.maps.color !== undefined || m.maps.emissive !== undefined, {
    message: 'material completo precisa de "color" ou "emissive"',
  });

export const PACKAGE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
export const PACKAGE_VERSION_RE = /^\d+\.\d+\.\d+$/;

export const PackageManifestSchema = z.object({
  schema: z.literal(1),
  id: z.string().regex(PACKAGE_ID_RE),
  kind: z.literal('textures'),
  name: z.string().min(1),
  version: z.string().regex(PACKAGE_VERSION_RE),
  license: z.object({
    spdx: z.string().min(1),
    redistributable: z.boolean(),
    attribution: z.string().optional(),
    source: z.string().optional(),
  }),
  archive: z
    .object({
      file: z.string().min(1),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      bytes: z.number().int().nonnegative(),
    })
    .optional(),
  materials: z.array(MaterialSchema),
});

export type PackageManifest = z.infer<typeof PackageManifestSchema>;
export type PackageMaterial = PackageManifest['materials'][number];

/** Valida um manifesto já parseado de JSON. Lança com a lista de problemas. */
export function parsePackageManifest(raw: unknown): PackageManifest {
  const r = PackageManifestSchema.safeParse(raw);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`);
    throw new Error(`cortex-package.json inválido — ${issues.join('; ')}`);
  }
  return r.data;
}

/** Item do `EditorTexturePicker` (ADR-0073) pra um material de pacote. */
export interface PackageMaterialPick {
  name: string;
  thumb: string;
  group: string;
  value: { diffuse: string; normal?: string; roughness?: string };
}

/**
 * Converte os materiais de um pacote instalado em itens do seletor de textura.
 * `baseUrl` é a URL da pasta do pacote (ex.: `/assets/packages/<id>/`).
 * Materiais incompletos ou só emissivos ficam fora (não servem de superfície).
 */
export function packageMaterialPicks(manifest: PackageManifest, baseUrl: string): PackageMaterialPick[] {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const out: PackageMaterialPick[] = [];
  for (const m of manifest.materials) {
    if (m.incomplete || !m.maps.color) continue;
    const value: PackageMaterialPick['value'] = { diffuse: base + m.maps.color };
    if (m.maps.normal) value.normal = base + m.maps.normal;
    if (m.maps.roughness) value.roughness = base + m.maps.roughness;
    out.push({ name: m.name, thumb: value.diffuse, group: manifest.name, value });
  }
  return out;
}
