# Roda em: blender --background <file.blend> --python dump_blend.py
# Extrai a ESTRUTURA de level design: coleções, instâncias reaproveitadas,
# bbox do percurso, histograma de peças, progressão ao longo do eixo principal
# e objetos de gameplay (spawn/checkpoint/finish/hazards).
import bpy, re
from collections import Counter, defaultdict
from mathutils import Vector

sc = bpy.context.scene
objs = [o for o in bpy.data.objects]

def base(name):
    n = re.sub(r'\.\d+$', '', name)          # tira .001
    n = re.sub(r'[_.]?\d+$', '', n)           # tira _001 / número final
    return n.lower()

print("\n================ COLEÇÕES (organização do autor) ================")
def walk_coll(c, depth=0):
    direct = len(c.objects)
    total = len(c.all_objects)
    print(f"{'  '*depth}- {c.name}  (objs diretos={direct}, total c/ filhas={total})")
    for ch in c.children:
        walk_coll(ch, depth+1)
walk_coll(sc.collection)

print("\n================ TOTAIS ================")
mesh_objs = [o for o in objs if o.type == 'MESH']
empties   = [o for o in objs if o.type == 'EMPTY']
print("objetos:", len(objs), "| MESH:", len(mesh_objs), "| EMPTY:", len(empties),
      "| outros:", len(objs)-len(mesh_objs)-len(empties))
print("data-meshes ÚNICOS (bpy.data.meshes):", len(bpy.data.meshes))

# instâncias: quantos objetos compartilham o mesmo mesh-data (reaproveitamento)
users = Counter()
for o in mesh_objs:
    if o.data: users[o.data.name] += 1
reused = {k:v for k,v in users.items() if v > 1}
inst_total = sum(v for v in reused.values())
print(f"mesh-data reaproveitados: {len(reused)} datas → {inst_total} objetos são instâncias de algo repetido")
print("top 15 mais instanciados:")
for k,v in sorted(reused.items(), key=lambda x:-x[1])[:15]:
    print(f"   {v:4}x  {k}")

# bounding box do nível (world, cantos das meshes)
mn = Vector(( 1e18, 1e18, 1e18)); mx = Vector((-1e18,-1e18,-1e18))
for o in mesh_objs:
    for corner in o.bound_box:
        w = o.matrix_world @ Vector(corner)
        for i in range(3):
            mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
dim = mx - mn
print("\n================ BOUNDING BOX (metros) ================")
print("min:", [round(v,1) for v in mn])
print("max:", [round(v,1) for v in mx])
print("dim (X,Y,Z):", [round(v,1) for v in dim])
axis = max(range(3), key=lambda i: dim[i]); axn = "XYZ"[axis]
print(f"eixo de PROGRESSÃO (maior dimensão): {axn}  (comprimento {round(dim[axis],1)} m)")

print("\n================ HISTOGRAMA DE PEÇAS (base → contagem) top 50 ================")
hist = Counter(base(o.name) for o in mesh_objs)
for k,v in hist.most_common(50):
    print(f"   {v:4}  {k}")

# progressão: divide o eixo principal em 12 fatias e conta peças por fatia
print("\n================ RITMO AO LONGO DA PROGRESSÃO (12 fatias no eixo "+axn+") ================")
N=12
lo, hi = mn[axis], mx[axis]
step = (hi-lo)/N if hi>lo else 1
buckets = defaultdict(Counter)
for o in mesh_objs:
    c = (o.matrix_world @ Vector((0,0,0)))[axis]
    b = min(N-1, int((c-lo)/step))
    buckets[b][base(o.name)] += 1
for b in range(N):
    z0 = round(lo+b*step,0); z1=round(lo+(b+1)*step,0)
    total = sum(buckets[b].values())
    top = ", ".join(f"{k}×{v}" for k,v in buckets[b].most_common(5))
    print(f"  [{axn} {z0:>7.0f}..{z1:<7.0f}] {total:4} peças | {top}")

# gameplay / markers
print("\n================ OBJETOS DE GAMEPLAY / MARKERS ================")
rx = re.compile(r'spawn|start|checkpoint|finish|flag|goal|coin|bomb|tnt|dynamite|anvil|spike|saw|trap|kill|death|hazard|button|door|trigger|marker|empty|point|path|way', re.I)
gm = [o for o in objs if rx.search(o.name)]
gm.sort(key=lambda o: (o.matrix_world @ Vector((0,0,0)))[axis])
for o in gm[:60]:
    p = o.matrix_world @ Vector((0,0,0))
    print(f"   {axn}={p[axis]:8.1f}  {o.type:6} {o.name}")
print(f"(total markers: {len(gm)})")

# animações (obstáculos móveis?)
print("\n================ ANIMAÇÃO / RIG ================")
anim = [o for o in objs if o.animation_data and o.animation_data.action]
print("objetos com action (movimento animado):", len(anim))
for o in anim[:15]:
    print("   ", o.type, o.name, "->", o.animation_data.action.name)
print("actions no arquivo:", len(bpy.data.actions), "| armatures:", len([o for o in objs if o.type=='ARMATURE']))
