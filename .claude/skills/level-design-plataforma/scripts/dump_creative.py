# Análise CRIATIVA/VISUAL do level design. Roda:
#   blender --background <file.blend> --python dump_creative.py
import bpy, re, math
from collections import Counter, defaultdict
from mathutils import Vector

# Só o nível montado (coleção Demonstration), ignora o showroom "Assets"
demo = bpy.data.collections.get('Demonstration')
objs = list(demo.all_objects) if demo else [o for o in bpy.data.objects if o.type=='MESH']
objs = [o for o in objs if o.type=='MESH']

def base(n):
    n = re.sub(r'\.\d+$','',n); n = re.sub(r'[_.]?\d+$','',n); return n.lower()

def cat(b):
    if b in ('grass','land','landscape'): return 'ground'
    if b in ('fence_pillar','fence_wood','fence','stake','rope','barrier','bridge','ladder'): return 'border/traversal'
    if b in ('tree','bush','flower','vegetation','log','big_log','pumpkin','hive','berries','apple'): return 'vegetation/decor'
    if b in ('rock','stone','stones'): return 'terrain-decor'
    if b.startswith('obstacle') or b in ('bomb','tnt','box_tnt','dynamite','anvil','cannon','waves'): return 'obstacle/hazard'
    if b in ('checkpoint','checkpoint_tree','finish','flag','coin','indicator','signboard','scroll'): return 'gameplay-marker'
    return 'other'

pos = {o.name:(o.matrix_world @ Vector((0,0,0))) for o in objs}
xs = [p.x for p in pos.values()]
X0, X1 = min(xs), max(xs)

# 1) VERTICALIDADE — perfil de altura Z do CHÃO ao longo de X (12 fatias)
print("=== 1. VERTICALIDADE (perfil Z do chão ao longo do percurso X) ===")
N=12; step=(X1-X0)/N
gz=defaultdict(list); allz=defaultdict(list)
for o in objs:
    b=base(o.name); p=pos[o.name]; bk=min(N-1,int((p.x-X0)/step))
    allz[bk].append(p.z)
    if cat(b)=='ground': gz[bk].append(p.z)
for bk in range(N):
    z=gz.get(bk) or allz.get(bk) or [0]
    zmin=min(z); zmax=max(z)
    print(f"  faixa {bk:2}  X {X0+bk*step:7.0f}  chão Z méd {sum(z)/len(z):6.1f}  (min {zmin:5.1f} max {zmax:5.1f}  amplitude {zmax-zmin:4.1f})")

# 2) ALEATORIEDADE NATURAL — variação de rotação (Z-euler) e escala por categoria
print("\n=== 2. SCATTER NATURAL — rotação e escala por categoria ===")
by=defaultdict(list)
for o in objs: by[cat(base(o.name))].append(o)
for c,lst in sorted(by.items(), key=lambda x:-len(x[1])):
    rots=[ (o.rotation_euler.z*180/math.pi)%360 for o in lst ]
    scs=[ o.scale.x for o in lst ]
    # espalhamento de rotação: quantos valores distintos (arredondado a 5°)
    distinct=len(set(round(r/5)*5 for r in rots))
    smin,smax=min(scs),max(scs)
    print(f"  {c:18} n={len(lst):4}  rot distintas(~5°)={distinct:3}  escala {smin:.2f}..{smax:.2f}")

# 3) PALETA / MATERIAIS — cores base dominantes
print("\n=== 3. PALETA (materiais e base color) ===")
mats=Counter()
colors=[]
for o in objs:
    for s in o.material_slots:
        if s.material:
            mats[s.material.name]+=1
            m=s.material
            if m.use_nodes:
                for nd in m.node_tree.nodes:
                    if nd.type=='BSDF_PRINCIPLED':
                        c=nd.inputs['Base Color'].default_value
                        colors.append((round(c[0],2),round(c[1],2),round(c[2],2)))
print("  materiais únicos:", len(mats), "| top 12 por uso:")
for k,v in mats.most_common(12): print(f"     {v:4}x  {k}")
cc=Counter(colors)
print("  cores base mais comuns (RGB linear), top 12:")
for k,v in cc.most_common(12): print(f"     {v:4}x  {k}")

# 4) CADÊNCIA DE DESAFIO — espaçamento entre obstáculos/hazards ao longo de X
print("\n=== 4. CADÊNCIA DE DESAFIO (gaps entre obstáculos ao longo de X) ===")
haz=sorted([pos[o.name].x for o in objs if cat(base(o.name))=='obstacle/hazard'])
gaps=[round(haz[i+1]-haz[i],1) for i in range(len(haz)-1) if haz[i+1]-haz[i]>0.3]
if gaps:
    gaps_s=sorted(gaps)
    print(f"  {len(haz)} obstáculos/hazards | gap médio {sum(gaps)/len(gaps):.1f}m  mediano {gaps_s[len(gaps_s)//2]}m  min {min(gaps)}  max {max(gaps)}")
# densidade obstáculo vs decor por fatia
print("\n=== 5. RAZÃO DESAFIO×DECORAÇÃO por fatia ===")
dc=defaultdict(Counter)
for o in objs:
    c=cat(base(o.name)); bk=min(N-1,int((pos[o.name].x-X0)/step)); dc[bk][c]+=1
for bk in range(N):
    d=dc[bk]; hz=d['obstacle/hazard']; veg=d['vegetation/decor']+d['terrain-decor']; gnd=d['ground']
    print(f"  faixa {bk:2}: hazard={hz:3}  decor={veg:3}  ground={gnd:3}  marker={d['gameplay-marker']:2}  border={d['border/traversal']:3}")

# 6) LARGURA DA PISTA (Y) ao longo de X — a lane alarga/estreita?
print("\n=== 6. LARGURA DA PISTA (spread Y do chão) por fatia ===")
wy=defaultdict(list)
for o in objs:
    if cat(base(o.name))=='ground': wy[min(N-1,int((pos[o.name].x-X0)/step))].append((o.matrix_world@Vector((0,0,0))).y)
for bk in range(N):
    ys=wy.get(bk)
    if ys: print(f"  faixa {bk:2}: largura Y ≈ {max(ys)-min(ys):5.1f}m  (min {min(ys):5.1f} max {max(ys):5.1f})")
