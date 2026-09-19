/**
 * Tipos do shim do Rapier nativo (`rapier-compat.js`).
 *
 * O shim é JS de propósito — ele roda no Hermes, fora do build de tipos do
 * engine. Sem esta declaração cada teste que o importa acusa `TS7016`
 * ("implicitly has an 'any' type"), e o ruído escondia erros de verdade.
 *
 * Os tipos são deliberadamente frouxos: o contrato real é o do
 * `@dimforge/rapier3d-compat`, e apertar aqui só duplicaria a manutenção.
 */

/** Vetor 3D como o Rapier troca com o JS. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export declare const World: any;
export declare const RigidBodyDesc: any;
export declare const ColliderDesc: any;
export declare const VehicleController: any;
export declare const Collider: any;
