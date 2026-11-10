"""Ajustes por clipe do auto-rig (SPEC-0724): os da aba Animações do Studio (SPEC-0349, adendos 4 a 9) aplicados
ao retarget, com a mesma conta da prévia do Studio. Rotações no espaço do mundo do Blender, por osso.
"""
import math

from mathutils import Matrix, Quaternion, Vector

from autorig_skeleton import SIDES

# ajustes de braço por clipe, na ordem dos parâmetros de `arm_offsets` (graus)
ARM_OFFSET_KEYS = ('shoulderLift', 'armSpace', 'elbowSpace', 'shoulderBack', 'armTwist', 'foreArmTwist')
# no Blender o osso aponta pelo Y local
BONE_AXIS = Vector((0.0, 1.0, 0.0))


def arm_offsets(frame_rots, dst_t_rot, lift_deg, space_deg, elbow_deg=0.0, back_deg=0.0, arm_twist_deg=0.0, fore_twist_deg=0.0):
    """Ajuste por clipe (o "Character Arm-Space" do Mixamo, SPEC-0349 adendo 4): em volta da frente do peito
    no quadro, `shoulderLift` gira a clavícula e o braço inteiro (sobe/desce o ombro) e `armSpace` gira
    braço, antebraço e mão (abre/fecha) e `elbowSpace` gira antebraço e mão no cotovelo (mão pra fora/
    pra dentro); `shoulderBack` gira a clavícula e o braço inteiro em volta da VERTICAL do peito (+ leva o
    ombro pra trás e abre o peito). Lado +x com +θ, lado −x espelhado. `armTwist` gira braço, antebraço e
    mão em volta do eixo do próprio BRAÇO e `foreArmTwist` gira antebraço e mão em volta do eixo do
    ANTEBRAÇO, cada eixo lido já com os ajustes anteriores; + é rotação externa (palma pra frente, cotovelo
    junto do corpo), por isso −θ no lado +x (SPEC-0349 adendo 7). É o que girar o osso local faz na
    hierarquia (a prévia do Studio usa a mesma conta)."""
    chest = frame_rots['Spine2'] @ dst_t_rot['Spine2'].inverted()
    forward = chest @ Vector((0.0, -1.0, 0.0))
    up = chest @ Vector((0.0, 0.0, 1.0))
    out = dict(frame_rots)
    for side, s in SIDES.items():
        lift = Matrix.Rotation(math.radians(s * lift_deg), 3, forward)
        space = Matrix.Rotation(math.radians(s * space_deg), 3, forward)
        elbow = Matrix.Rotation(math.radians(s * elbow_deg), 3, forward)
        clavicle = lift @ Matrix.Rotation(math.radians(s * back_deg), 3, up)
        out[side + 'Shoulder'] = clavicle @ out[side + 'Shoulder']
        arm = space @ clavicle
        arm = Matrix.Rotation(math.radians(-s * arm_twist_deg), 3, arm @ out[side + 'Arm'] @ BONE_AXIS) @ arm
        fore = elbow @ arm
        fore = Matrix.Rotation(math.radians(-s * fore_twist_deg), 3, fore @ out[side + 'ForeArm'] @ BONE_AXIS) @ fore
        out[side + 'Arm'] = arm @ out[side + 'Arm']
        for b in ('ForeArm', 'Hand'):
            out[side + b] = fore @ out[side + b]
    return out


# juntas que podem seguir outra (fim de uma cadeia de dois ossos)
FOLLOW_BONES = tuple(side + b for side in SIDES for b in ('Hand', 'Foot'))
# espaço do modelo do GLB (Y pra cima, +Z frente) → Blender (Z pra cima, −Y frente); rotação própria
GLTF_TO_BLENDER = Matrix(((1.0, 0.0, 0.0), (0.0, 0.0, -1.0), (0.0, 1.0, 0.0)))


def gltf_quat(q):
    """`[x, y, z, w]` no espaço do modelo do GLB → matriz de rotação no espaço do Blender."""
    x, y, z, w = q
    return GLTF_TO_BLENDER @ Quaternion((w, x, y, z)).to_matrix() @ GLTF_TO_BLENDER.transposed()


def pose_offsets(frame_rots, rest_rots, parent_of, names, pose):
    """Pose por clipe (SPEC-0349 adendo 8), editada no Studio junta a junta: `pose[n]` é a rotação R do osso
    `n` no espaço do modelo com o pai no repouso. Na ordem da hierarquia, com P = W_pai · W_pai_repouso⁻¹ (o
    giro do pai a partir do repouso, no quadro, antes da pose) e C = W'_pai · W_pai⁻¹ (o que a pose já mudou
    no pai): W'_n = C · P · R · P⁻¹ · W_n. Sem R: W'_n = C · W_n (o filho acompanha). Cada junta é dela (sem
    espelho). A prévia do Studio usa a mesma conta."""
    out, corr = dict(frame_rots), {}
    for n in names:
        p = parent_of(n)
        c = corr.get(p, Matrix.Identity(3))
        w = frame_rots[n]
        if n in pose:
            par = frame_rots[p] @ rest_rots[p].inverted() if p else Matrix.Identity(3)
            out[n] = c @ par @ gltf_quat(pose[n]) @ par.inverted() @ w
        else:
            out[n] = c @ w
        corr[n] = out[n] @ w.inverted()
    return out


def joint_heads(frame_rots, hip, rest_rots, rest_heads, parent_of, names):
    """Cabeça de cada osso no quadro (FK): a do pai + o giro do pai a partir do repouso × o vetor do repouso."""
    heads = {}
    for n in names:
        p = parent_of(n)
        heads[n] = hip.copy() if not p else heads[p] + frame_rots[p] @ rest_rots[p].inverted() @ (rest_heads[n] - rest_heads[p])
    return heads


def shortest_arc(a, b):
    """Rotação de menor arco que leva a direção `a` à `b`."""
    return a.normalized().rotation_difference(b.normalized()).to_matrix()


def follow_constraints(frame_rots, hip, rest_rots, rest_heads, parent_of, names, follows):
    """Ligação "seguir" por clipe (SPEC-0349 adendo 9): em cada quadro a junta `bone` (mão ou pé) vai até a
    `target` mais `offset` e gira com ela mais `rotation`, os dois medidos no Studio no quadro em que a ligação
    foi criada, no espaço do modelo do GLB e relativos ao giro da `target` a partir do repouso (T = W_t ·
    W_t_repouso⁻¹): alvo = cabeça_t + T · offset e giro de repouso da junta = T · rotation. Os dois ossos de cima
    (braço e antebraço / coxa e perna) fazem IK de dois ossos mantendo o plano da dobra (o polo é o cotovelo/
    joelho do quadro); fora do alcance, estica na direção do alvo. Depois de cada ligação as cabeças são
    recalculadas (uma pode seguir a outra). A prévia do Studio usa a mesma conta."""
    out = dict(frame_rots)
    for c in follows:
        f, t = c['bone'], c['target']
        mid = parent_of(f)
        up = parent_of(mid)
        heads = joint_heads(out, hip, rest_rots, rest_heads, parent_of, names)
        T = out[t] @ rest_rots[t].inverted()
        goal = heads[t] + T @ (GLTF_TO_BLENDER @ Vector(c['offset']))
        s, e, w = heads[up], heads[mid], heads[f]
        a, b = (rest_heads[mid] - rest_heads[up]).length, (rest_heads[f] - rest_heads[mid]).length
        to_goal = goal - s
        u = to_goal.normalized()
        d = min(max(to_goal.length, abs(a - b) + 1e-6), a + b - 1e-6)
        pole = (e - s) - u * (e - s).dot(u)
        if pole.length < 1e-9:  # braço reto na direção do alvo: o polo é a dobra do repouso
            pole = (e - s).orthogonal()
        v = pole.normalized()
        cos_e = max(-1.0, min(1.0, (a * a + d * d - b * b) / (2 * a * d)))
        e2 = s + (u * cos_e + v * math.sqrt(1 - cos_e * cos_e)) * a
        w2 = s + u * d
        g_up = shortest_arc(e - s, e2 - s)
        g_mid = shortest_arc(g_up @ (w - e), w2 - e2)
        rest_turn = T @ gltf_quat(c['rotation'])
        old = {n: out[n] for n in names}
        out[up] = g_up @ old[up]
        out[mid] = g_mid @ g_up @ old[mid]
        out[f] = rest_turn @ rest_rots[f]
        # o que fica abaixo da junta segue o giro dela
        corr = {up: out[up] @ old[up].inverted(), mid: out[mid] @ old[mid].inverted(), f: out[f] @ old[f].inverted()}
        for n in names:
            p = parent_of(n)
            if n not in corr and p in corr:
                out[n] = corr[p] @ old[n]
                corr[n] = corr[p]
    return out
