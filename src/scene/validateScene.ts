import type { SceneDefinition, SceneNode, Vec3 } from './SceneDefinition.js';
import type { SceneFileV1 } from './SceneFile.js';
import { kitAssetFor, resolveAttachTransform, type KitManifest } from './Kit.js';

/**
 * **Validação geométrica ESTÁTICA da cena** (dados, sem three/GPU): detecta os
 * defeitos que custavam iterações de screenshot — interpenetração, peça
 * flutuando, gameplay tombado/desalinhado, gap impulável — a partir do JSON da
 * cena + `size`/anchors do `kit.json` + overlay do editor.
 *
 * Regra de ouro do pipeline: geometria valida-se com CÓDIGO (barato, 100%
 * confiável); screenshot/crítica visual é pra composição e beleza, DEPOIS de
 * `errors` zerar. Regras destiladas do lint de fases (game-design-bible,
 * `ai-rules/fases-por-trechos.md`, R1–R5) generalizadas pro engine.
 *
 * Convenção de pivô: nós `model` têm origem na BASE-centro (padrão dos kits —
 * `anchors.top` em `[0,h,0]`); `primitive`/`mesh` no CENTRO (BoxGeometry).
 */

export interface SceneViolation {
  /** `overlap | floating | tilted | misaligned | gap | rise | attach` */
  rule: string;
  severity: 'error' | 'warning';
  nodeId: string;
  otherId?: string;
  message: string;
}

export interface SceneValidationReport {
  errors: SceneViolation[];
  warnings: SceneViolation[];
  /** Nós avaliados/pulados (sem size conhecido) — transparência de cobertura. */
  stats: { nodes: number; boxed: number; skipped: string[] };
}

export interface ValidateSceneOptions {
  kit?: KitManifest | KitManifest[];
  overlay?: SceneFileV1 | null;
  /** Maior vão horizontal pulável (unidades). Default 2.8 (lint R4). */
  maxGap?: number;
  /** Maior subida entre plataformas vizinhas. Default 3. */
  maxRise?: number;
  /** Interpenetração acima disso é `error` (abaixo, `warning`). Default 0.15. */
  maxPenetration?: number;
  /**
   * Override de severidade POR REGRA (`overlap`, `floating`, `gap`…): força
   * `error`/`warning` ou suprime com `off`. É por onde regras APRENDIDAS do
   * projeto (`.cortex/validation-rules.json`, ADR-0115) endurecem ou relaxam o
   * validador sem mudar o código do engine.
   */
  severity?: Record<string, 'error' | 'warning' | 'off'>;
}

interface NodeBox {
  id: string;
  node: SceneNode;
  min: Vec3;
  max: Vec3;
  rotX: number;
  rotY: number;
  rotZ: number;
  role: string | undefined;
  solid: boolean;
}

const GROUND_ROLES = new Set(['ground', 'platform', 'connector', 'tile']);
const GAMEPLAY_ROLES = new Set(['ground', 'platform', 'connector', 'hazard', 'collectible', 'player-start', 'cap']);
const EPS_TOUCH = 0.05; // contato legítimo (peças encostadas)
const EPS_PENETRATION = 0.15; // acima disso é interpenetração de verdade
const EPS_FLOAT = 0.15; // base acima disso sem apoio = flutuando
const SUPPORT_REACH = 0.35; // quão abaixo da base um apoio ainda "segura"

const asVec3 = (s: number | Vec3 | undefined, d: number): Vec3 =>
  s === undefined ? [d, d, d] : typeof s === 'number' ? [s, s, s] : s;

/** AABB do box `size` girado por `rotY` (footprint conservador no plano XZ). */
function rotatedFootprint(w: number, d: number, rotY: number): [number, number] {
  const c = Math.abs(Math.cos(rotY));
  const s = Math.abs(Math.sin(rotY));
  return [w * c + d * s, w * s + d * c];
}

function overlap1D(minA: number, maxA: number, minB: number, maxB: number): number {
  return Math.min(maxA, maxB) - Math.max(minA, minB);
}

/**
 * Valida a cena estaticamente. Nunca lança por problema DE CENA — problemas
 * viram violações no report (inclusive attach quebrado, que no `buildScene`
 * falharia alto).
 */
export function validateScene(
  defs: SceneDefinition | SceneDefinition[],
  options: ValidateSceneOptions = {},
): SceneValidationReport {
  const list = Array.isArray(defs) ? defs : [defs];
  const overlay = options.overlay ?? null;
  const maxGap = options.maxGap ?? 2.8;
  const maxRise = options.maxRise ?? 3;
  const maxPenetration = options.maxPenetration ?? EPS_PENETRATION;
  const violations: SceneViolation[] = [];
  const skipped: string[] = [];

  const deleted = new Set<string>(
    Array.isArray(overlay?.data?.['deleted']) ? (overlay!.data['deleted'] as string[]) : [],
  );
  const added = Array.isArray(overlay?.data?.['added']) ? (overlay!.data['added'] as SceneNode[]) : [];
  const overrides = overlay?.objects ?? {};

  const nodes = [...list.flatMap((d) => d.nodes), ...added].filter((n) => !deleted.has(n.id));
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  // ── Pose estática por nó (overlay > attach > place > transform) ─────────────
  const poses = new Map<string, { position: Vec3; rotationY: number; scale: Vec3; rotX: number; rotZ: number }>();
  const resolving = new Set<string>();

  const poseOf = (node: SceneNode): { position: Vec3; rotationY: number; scale: Vec3; rotX: number; rotZ: number } | null => {
    const cached = poses.get(node.id);
    if (cached) return cached;
    if (resolving.has(node.id)) {
      violations.push({
        rule: 'attach',
        severity: 'error',
        nodeId: node.id,
        message: `ciclo de attach envolvendo "${node.id}" (o buildScene vai falhar)`,
      });
      return null;
    }
    resolving.add(node.id);

    const t = (node as { transform?: { position?: number[]; rotation?: number[]; scale?: number | number[] } }).transform;
    const place = (node as { place?: { x?: number; y?: number; z?: number; rotY?: number; scale?: number } }).place;
    const attach = (node as { attach?: { socket: string; to: string; toSocket: string } }).attach;
    const scale = asVec3((t?.scale ?? place?.scale) as number | Vec3 | undefined, 1);
    let rotationY = t?.rotation?.[1] ?? place?.rotY ?? 0;
    const rotX = t?.rotation?.[0] ?? 0;
    const rotZ = t?.rotation?.[2] ?? 0;
    let position: Vec3;

    const ov = overrides[node.id];
    if (ov) {
      position = [ov.position[0]!, ov.position[1]!, ov.position[2]!];
      rotationY = ov.rotation[1]!;
      const pose = { position, rotationY, scale: [ov.scale[0]!, ov.scale[1]!, ov.scale[2]!] as Vec3, rotX: ov.rotation[0]!, rotZ: ov.rotation[2]! };
      poses.set(node.id, pose);
      resolving.delete(node.id);
      return pose;
    }

    if (attach && node.type === 'model') {
      const target = nodesById.get(attach.to);
      const ownAsset = kitAssetFor(options.kit, node.url);
      const targetAsset = target?.type === 'model' ? kitAssetFor(options.kit, target.url) : undefined;
      const ownAnchor = ownAsset?.anchors?.[attach.socket];
      const targetAnchor = targetAsset?.anchors?.[attach.toSocket];
      const targetPose = target ? poseOf(target) : null;
      if (!target || !targetPose || !ownAnchor || !targetAnchor) {
        violations.push({
          rule: 'attach',
          severity: 'error',
          nodeId: node.id,
          otherId: attach.to,
          message: !target
            ? `attach aponta pra nó inexistente "${attach.to}"`
            : !ownAnchor
              ? `socket "${attach.socket}" não existe no kit pra "${node.id}"`
              : !targetAnchor
                ? `socket "${attach.toSocket}" não existe no kit pro alvo "${attach.to}"`
                : `alvo "${attach.to}" irresolvível`,
        });
        resolving.delete(node.id);
        return null;
      }
      const solved = resolveAttachTransform(
        { position: targetPose.position, rotationY: targetPose.rotationY, scale: targetPose.scale },
        targetAnchor,
        ownAnchor,
        { rotationY, scale },
      );
      const pose = { position: solved.position, rotationY: solved.rotationY, scale, rotX, rotZ };
      poses.set(node.id, pose);
      resolving.delete(node.id);
      return pose;
    }

    if (place) {
      position = [place.x ?? 0, place.y ?? 0, place.z ?? 0]; // base em y (grounding)
      const pose = { position, rotationY, scale, rotX, rotZ };
      poses.set(node.id, pose);
      resolving.delete(node.id);
      return pose;
    }

    position = t?.position ? [t.position[0]!, t.position[1]!, t.position[2]!] : [0, 0, 0];
    const pose = { position, rotationY, scale, rotX, rotZ };
    poses.set(node.id, pose);
    resolving.delete(node.id);
    return pose;
  };

  // ── Caixas (AABB estático) por nó ───────────────────────────────────────────
  const boxes: NodeBox[] = [];
  for (const node of nodes) {
    if (node.type !== 'model' && node.type !== 'primitive' && node.type !== 'terrain') {
      continue; // luz/água/background/sprite/vegetation/mesh: fora da v1
    }
    const pose = poseOf(node);
    if (!pose) continue;

    let size: Vec3 | undefined;
    let role: string | undefined;
    let solid = false;
    let pivotBase = false;

    if (node.type === 'model') {
      const asset = kitAssetFor(options.kit, node.url);
      size = asset?.size;
      role = asset?.role;
      const collider = node.collider ?? asset?.collider;
      solid = !!collider && collider.solid !== false;
      pivotBase = true; // kits: origem na base-centro (anchors.top = [0,h,0])
    } else if (node.type === 'primitive') {
      size = asVec3(node.size as number | Vec3 | undefined, 1);
      solid = !!node.collider && node.collider.solid !== false;
      role = solid ? 'platform' : undefined;
    } else {
      // terrain: plano de chão em y (apoio pro floating check)
      const s = node.size ?? 50;
      const [w, d] = typeof s === 'number' ? [s, s] : s;
      size = [w, 0, d];
      role = 'ground';
      solid = true;
    }
    if (!size) {
      skipped.push(node.id);
      continue;
    }

    const hasPlace = !!(node as { place?: unknown }).place && !overrides[node.id];
    const baseAtY = pivotBase || hasPlace; // place assenta a BASE em y
    const [sw, sh, sd] = [size[0] * pose.scale[0], size[1] * pose.scale[1], size[2] * pose.scale[2]];
    const [fw, fd] = rotatedFootprint(sw, sd, pose.rotationY);
    const [px, py, pz] = pose.position;
    const minY = baseAtY ? py : py - sh / 2;
    boxes.push({
      id: node.id,
      node,
      min: [px - fw / 2, minY, pz - fd / 2],
      max: [px + fw / 2, minY + sh, pz + fd / 2],
      rotX: pose.rotX,
      rotY: pose.rotationY,
      rotZ: pose.rotZ,
      role,
      solid,
    });
  }

  // ── R1: interpenetração entre sólidos ───────────────────────────────────────
  const solids = boxes.filter((b) => b.solid);
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i]!;
      const b = solids[j]!;
      const ox = overlap1D(a.min[0], a.max[0], b.min[0], b.max[0]);
      const oy = overlap1D(a.min[1], a.max[1], b.min[1], b.max[1]);
      const oz = overlap1D(a.min[2], a.max[2], b.min[2], b.max[2]);
      if (ox <= EPS_TOUCH || oy <= EPS_TOUCH || oz <= EPS_TOUCH) continue;
      const depth = Math.min(ox, oy, oz);
      violations.push({
        rule: 'overlap',
        severity: depth > maxPenetration ? 'error' : 'warning',
        nodeId: a.id,
        otherId: b.id,
        message: `"${a.id}" interpenetra "${b.id}" (${depth.toFixed(2)}u no eixo mais raso)`,
      });
    }
  }

  // ── R2: peça sólida flutuando (sem apoio sob a base) ───────────────────────
  for (const b of solids) {
    if (b.node.type === 'terrain') continue;
    if (b.min[1] <= EPS_FLOAT) continue; // no chão (y=0)
    const hasAttach = !!(b.node as { attach?: unknown }).attach;
    if (hasAttach) continue; // encaixado por socket = posição estrutural
    const supported = solids.some((s) => {
      if (s.id === b.id) return false;
      const topGap = b.min[1] - s.max[1];
      if (topGap < -EPS_TOUCH || topGap > SUPPORT_REACH) return false;
      const ox = overlap1D(b.min[0], b.max[0], s.min[0], s.max[0]);
      const oz = overlap1D(b.min[2], b.max[2], s.min[2], s.max[2]);
      return ox > 0 && oz > 0;
    });
    if (!supported) {
      // Plataforma flutuante INTENCIONAL existe em platformer — só é erro quando
      // o role diz "chão/prop assentável"; plataforma vira warning informativo.
      const isFloatingKind = b.role === 'platform';
      violations.push({
        rule: 'floating',
        severity: isFloatingKind ? 'warning' : 'error',
        nodeId: b.id,
        message: `"${b.id}" (${b.role ?? 'sólido'}) está com a base a ${b.min[1].toFixed(2)}u sem apoio embaixo`,
      });
    }
  }

  // ── R3: gameplay tombado / desalinhado (lint R1+R2) ─────────────────────────
  for (const b of boxes) {
    const gameplay = (b.role && GAMEPLAY_ROLES.has(b.role)) || !!(b.node as { collider?: unknown }).collider;
    if (!gameplay) continue;
    if (Math.abs(b.rotX) > 0.02 || Math.abs(b.rotZ) > 0.02) {
      violations.push({
        rule: 'tilted',
        severity: 'error',
        nodeId: b.id,
        message: `"${b.id}" (${b.role ?? 'gameplay'}) está TOMBADO (rotX=${b.rotX.toFixed(2)}, rotZ=${b.rotZ.toFixed(2)}) — gameplay fica eixo-alinhado`,
      });
    }
    const quarter = Math.abs(((b.rotY % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2));
    const offAxis = Math.min(quarter, Math.PI / 2 - quarter);
    if (offAxis > 0.05 && b.role && GROUND_ROLES.has(b.role)) {
      violations.push({
        rule: 'misaligned',
        severity: 'warning',
        nodeId: b.id,
        message: `"${b.id}" (${b.role}) com rotY fora de múltiplo de 90° (${((b.rotY * 180) / Math.PI).toFixed(0)}°) — chão/plataforma alinham ao eixo`,
      });
    }
  }

  // ── R4/R5: vão e subida entre plataformas vizinhas (só se há player) ────────
  const hasPlayer = nodes.some((n) => (n as { player?: unknown }).player);
  if (hasPlayer) {
    const walkables = solids
      .filter((b) => b.role && GROUND_ROLES.has(b.role))
      .sort((a, b) => a.min[0] - b.min[0]);
    for (let i = 0; i + 1 < walkables.length; i++) {
      const cur = walkables[i]!;
      const next = walkables[i + 1]!;
      const gap = next.min[0] - cur.max[0];
      if (gap > maxGap) {
        const bridged = solids.some(
          (s) => s !== cur && s !== next && s.min[0] < next.min[0] && s.max[0] > cur.max[0],
        );
        if (!bridged) {
          violations.push({
            rule: 'gap',
            severity: 'warning',
            nodeId: cur.id,
            otherId: next.id,
            message: `vão de ${gap.toFixed(2)}u entre "${cur.id}" e "${next.id}" (máx pulável ~${maxGap}u)`,
          });
        }
      }
      const rise = next.max[1] - cur.max[1];
      if (rise > maxRise && next.min[0] - cur.max[0] > -EPS_TOUCH) {
        violations.push({
          rule: 'rise',
          severity: 'warning',
          nodeId: cur.id,
          otherId: next.id,
          message: `subida de ${rise.toFixed(2)}u de "${cur.id}" pra "${next.id}" (máx ~${maxRise}u)`,
        });
      }
    }
  }

  // Overrides de severidade por regra (regras aprendidas do projeto).
  const sev = options.severity ?? {};
  const finalViolations = violations
    .filter((v) => sev[v.rule] !== 'off')
    .map((v) => {
      const s = sev[v.rule];
      return s && s !== v.severity ? { ...v, severity: s as 'error' | 'warning' } : v;
    });

  return {
    errors: finalViolations.filter((v) => v.severity === 'error'),
    warnings: finalViolations.filter((v) => v.severity === 'warning'),
    stats: { nodes: nodes.length, boxed: boxes.length, skipped },
  };
}
