import type { RoadSurfaceName } from './surfaces.js';

/**
 * **Seção transversal de uma via** (ADR-0087). Uma faixa do perfil, da esquerda pra direita;
 * a soma das larguras = largura total da via. Calçada e meio-fio são faixas (não código
 * especial): calçada = `height` ~0.15 + `walkable`; o meio-fio aparece como o **degrau
 * vertical automático** entre faixas de alturas diferentes (ver {@link profileMesh}).
 */
export interface ProfileLane {
  role: 'roadway' | 'sidewalk' | 'curb' | 'median' | 'shoulder';
  /** Largura da faixa em metros. */
  width: number;
  /** Altura (Y) da faixa: 0 = pista; ~0.15 = calçada (degrau = meio-fio). */
  height: number;
  /** Superfície (override do default da via). */
  surface?: RoadSurfaceName;
  /** Entra no collider de PISTA do carro (`cortexRoad`). */
  drivable: boolean;
  /** Entra na navegação de PEDESTRE. */
  walkable: boolean;
}

/** Nomes dos perfis iniciais (ADR-0087). */
export type RoadProfileName =
  | 'highway'
  | 'arterial'
  | 'urban_primary'
  | 'urban_secondary'
  | 'residential'
  | 'industrial'
  | 'dirt'
  | 'pedestrian_market'
  | 'alley';

/** Um perfil completo: faixas + raio mínimo de curva + superfície/marcação default. */
export interface RoadProfile {
  name: RoadProfileName;
  lanes: ProfileLane[];
  /** Raio mínimo de curva (m) — orienta o traçado, não trava. */
  minRadius: number;
  /** Superfície default da pista (faixas sem `surface` própria). */
  surface: RoadSurfaceName;
}

const SW = 0.15; // altura padrão da calçada (degrau = meio-fio)

const drive = (width: number, height = 0): ProfileLane => ({ role: 'roadway', width, height, drivable: true, walkable: false });
const walk = (width: number, height = SW, surface: RoadSurfaceName = 'concrete'): ProfileLane => ({ role: 'sidewalk', width, height, surface, drivable: false, walkable: true });
const median = (width: number, height = SW): ProfileLane => ({ role: 'median', width, height, drivable: false, walkable: false });
const shoulder = (width: number): ProfileLane => ({ role: 'shoulder', width, height: 0, drivable: true, walkable: false });

/**
 * **Catálogo dos 9 perfis** (ADR-0087). Larguras em metros (total = soma das faixas). Stylized:
 * use com `matte` + `surfaces` tiláveis. Pista = `roadway`/`shoulder` (drivable), calçada =
 * `sidewalk` (walkable), `pedestrian_market` não tem pista (carro barrado).
 */
export const ROAD_PROFILES: Record<RoadProfileName, RoadProfile> = {
  highway: { name: 'highway', minRadius: 80, surface: 'asphalt', lanes: [shoulder(2), drive(13), median(2), drive(13), shoulder(2)] }, // 32 m
  arterial: { name: 'arterial', minRadius: 40, surface: 'asphalt', lanes: [walk(2), drive(9), median(2), drive(9), walk(2)] }, // 24 m
  urban_primary: { name: 'urban_primary', minRadius: 30, surface: 'asphalt', lanes: [walk(3), drive(8.5), median(1), drive(8.5), walk(3)] }, // 24 m
  urban_secondary: { name: 'urban_secondary', minRadius: 18, surface: 'asphalt', lanes: [walk(2.5), drive(9), walk(2.5)] }, // 14 m
  residential: { name: 'residential', minRadius: 12, surface: 'asphalt', lanes: [walk(2), drive(6), walk(2)] }, // 10 m
  industrial: { name: 'industrial', minRadius: 20, surface: 'concrete', lanes: [walk(1.5, 0.12), drive(13), walk(1.5, 0.12)] }, // 16 m
  dirt: { name: 'dirt', minRadius: 8, surface: 'dirt', lanes: [drive(6)] }, // 6 m, sem calçada
  pedestrian_market: { name: 'pedestrian_market', minRadius: 0, surface: 'brick', lanes: [{ role: 'sidewalk', width: 8, height: 0.1, surface: 'brick', drivable: false, walkable: true }] }, // 8 m, SEM pista
  alley: { name: 'alley', minRadius: 6, surface: 'concrete', lanes: [drive(4)] }, // 4 m
};

/** Perfil por nome (cai em `residential` se não existir). */
export function getProfile(name: RoadProfileName): RoadProfile {
  return ROAD_PROFILES[name] ?? ROAD_PROFILES.residential;
}

/** Largura total (m) de um perfil = soma das faixas. */
export function profileWidth(profile: RoadProfile): number {
  return profile.lanes.reduce((sum, l) => sum + l.width, 0);
}

/** `true` se o perfil tem alguma faixa dirigível (carro pode rodar). */
export function profileIsDrivable(profile: RoadProfile): boolean {
  return profile.lanes.some((l) => l.drivable);
}
