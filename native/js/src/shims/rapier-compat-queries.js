// Consultas do World no shim do Rapier nativo (SPEC-0671 dividiu o rapier-compat.js):
// raycast (SPEC-0216) e contatos da narrow-phase (SPEC-0393). O rapier-compat.js
// instala estas funções no `World.prototype`; `this` é o World.

/**
 * Máscara de `filterFlags` — os mesmos bits do `QueryFilterFlags` do Rapier,
 * que o Rust aplica DENTRO da travessia (SPEC-0216).
 */
const QUERY_EXCLUDE_FIXED = 1;
const QUERY_EXCLUDE_DYNAMIC = 2;
const QUERY_EXCLUDE_KINEMATIC = 4;
const QUERY_EXCLUDE_SENSORS = 8;
/** Todos os bits que sabemos traduzir (o resto é ignorado, como no browser). */
const QUERY_FLAGS_CONHECIDAS =
  QUERY_EXCLUDE_FIXED | QUERY_EXCLUDE_DYNAMIC | QUERY_EXCLUDE_KINEMATIC | QUERY_EXCLUDE_SENSORS;
/** `-1` = não excluir corpo nenhum (o Rust trata negativo como "sem exclusão"). */
const SEM_CORPO_EXCLUIDO = -1;

/** Quantos acertos recusados pelo predicate tentamos pular antes de desistir. */
const MAX_ACERTOS_RECUSADOS = 8;
/** Avanço além do acerto recusado, pra não reacertar o mesmo ponto. */
const EPSILON_AVANCO = 1e-4;

/**
 * Lança um raio e devolve o primeiro acerto ACEITO, com a NORMAL da superfície,
 * ou `null`. Mesma assinatura do `@dimforge/rapier3d-compat`, porque é o que o
 * engine e os jogos chamam — o `followGround` do carro usa isto por roda, todo
 * frame, pra colar o chassi no chão (SPEC-0216).
 *
 * Quando o `filterPredicate` RECUSA um acerto, a busca CONTINUA: a origem
 * avança logo além do ponto recusado e o raio é relançado. Sem isso, um sensor
 * no caminho (os gates de checkpoint ficam sobre a pista) devolvia `null`, o
 * carro perdia o chão e afundava no asfalto.
 */
export function castRayAndGetNormal(
  ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider,
  filterExcludeRigidBody, filterPredicate,
) {
  const origin = ray && ray.origin ? ray.origin : { x: 0, y: 0, z: 0 };
  const dir = ray && ray.dir ? ray.dir : { x: 0, y: -1, z: 0 };
  const flags = (typeof filterFlags === 'number' ? filterFlags : 0) & QUERY_FLAGS_CONHECIDAS;
  const excluir = filterExcludeRigidBody && typeof filterExcludeRigidBody.handle === 'number'
    ? filterExcludeRigidBody.handle
    : SEM_CORPO_EXCLUIDO;

  const temPredicate = typeof filterPredicate === 'function';
  const s = this.__scratch;
  // Origem que anda a cada recusa; `percorrido` guarda a distância desde a
  // origem ORIGINAL, que é o que o chamador espera receber.
  let ox = origin.x, oy = origin.y, oz = origin.z;
  let percorrido = 0;

  for (let tentativa = 0; tentativa <= MAX_ACERTOS_RECUSADOS; tentativa++) {
    const restante = maxToi - percorrido;
    if (restante <= 0) return null;
    const acertou = __rapierNative.worldCastRay(
      this.__ptr, ox, oy, oz, dir.x, dir.y, dir.z,
      restante, solid ? 1 : 0, flags, excluir,
    );
    if (acertou !== 1) return null;

    const distancia = percorrido + s[0];
    const collider = this.__collider(s[4]);
    if (!temPredicate || filterPredicate(collider)) {
      return {
        collider,
        // O runtime vendorizado lê `timeOfImpact`; tipagens antigas leem `toi`.
        // O `followGround` do kart-racer aceita os dois — devolvemos ambos.
        timeOfImpact: distancia,
        toi: distancia,
        normal: { x: s[1], y: s[2], z: s[3] },
        point: {
          x: origin.x + dir.x * distancia,
          y: origin.y + dir.y * distancia,
          z: origin.z + dir.z * distancia,
        },
      };
    }
    // Recusado: anda além dele e procura o próximo.
    const avanco = s[0] + EPSILON_AVANCO;
    percorrido += avanco;
    ox += dir.x * avanco;
    oy += dir.y * avanco;
    oz += dir.z * avanco;
  }
  return null;
};

// Narrow-phase contacts (SPEC-0393). The scratch is shared and the callbacks
// usually query again (contactPairsWith → contactPair), so every page / manifold
// is copied out of the scratch before a callback runs.
const SCRATCH_SIZE = 16;

function ContactManifold(dists) {
  this.__dists = dists;
}
ContactManifold.prototype.numContacts = function () { return this.__dists.length; };
ContactManifold.prototype.contactDist = function (i) { return this.__dists[i]; };

/** Calls `callback(collider2)` for every narrow-phase pair of `collider1`, like rapier3d-compat. */
export function contactPairsWith(collider1, callback) {
  const others = [];
  let written = SCRATCH_SIZE;
  while (written === SCRATCH_SIZE) {
    written = __rapierNative.worldContactPairsWith(this.__ptr, collider1.handle, others.length);
    for (let i = 0; i < written; i++) others.push(this.__scratch[i]);
  }
  for (let i = 0; i < others.length; i++) {
    callback(this.__collider(others[i]));
  }
};

/** Calls `callback(manifold, flipped)` once per contact manifold of the (collider1, collider2) pair. */
export function contactPair(collider1, collider2, callback) {
  for (let m = 0; ; m++) {
    const points = __rapierNative.worldContactPair(this.__ptr, collider1.handle, collider2.handle, m);
    if (points < 0) return;
    const flipped = this.__scratch[0] === 1;
    const dists = Array.from(this.__scratch.subarray(1, 1 + points));
    callback(new ContactManifold(dists), flipped);
  }
};

/**
 * Raycast sem normal — mesma busca do {@link World.castRayAndGetNormal}, só que
 * devolvendo `{ collider, toi, timeOfImpact }`. O kart-racer usa pros mísseis
 * acharem parede.
 */
export function castRay(
  ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider,
  filterExcludeRigidBody, filterPredicate,
) {
  const acerto = this.castRayAndGetNormal(
    ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider,
    filterExcludeRigidBody, filterPredicate,
  );
  if (!acerto) return null;
  return {
    collider: acerto.collider,
    timeOfImpact: acerto.timeOfImpact,
    toi: acerto.toi,
  };
};
