#!/usr/bin/env bash
# Triagem de um kit de assets bruto (ADR-0053 §4).
# Varre *.gltf em SRC, classifica cada modelo em base / hex / removed POR NOME,
# e gera o convert_list (linhas "src|dst") pro convert.py.
#
# Uso:
#   triage.sh <SRC_KIT_DIR> <BASE_DST_ASSETS> <HEX_DST_ASSETS> <OUT_DIR>
#
# As REGRAS abaixo são um ponto de partida (naming estilo Kenney/Quaternius).
# SEMPRE revise a amostra de removidos impressa e ajuste os padrões pro kit em mãos.
set -euo pipefail
SRC="$1"; BASE_DST="$2"; HEX_DST="$3"; OUT="$4"
mkdir -p "$OUT" "$BASE_DST" "$HEX_DST"
base="$OUT/base.txt"; hexl="$OUT/hex.txt"; rm_l="$OUT/removed.txt"; combined="$OUT/convert_list.txt"
: > "$base"; : > "$hexl"; : > "$rm_l"; : > "$combined"

# REMOVER do kit base: construções, fortificações, veículos, militar/facção,
# moderno/industrial. Ajuste por kit.
is_removed() {
  echo "$1" | grep -Eiq '^(building_|house|home_|castle|church|tavern|barracks|wall_|tower|windmill|watermill|lumbermill|blacksmith|market|mine_|well_|scaffolding)' && return 0
  echo "$1" | grep -Eiq '^(projectile_|wheelbarrow|cart|wagon|catapult|cannon|ballista|vehicle)' && return 0
  echo "$1" | grep -Eiq '^(weaponrack|target$|bucket_arrows|flag_|banner_|shield_|sword|spear)' && return 0
  echo "$1" | grep -Eiq '(jerrycan)|^parts_' && return 0
  return 1
}
# HEX / tiles top-down → kit terrain-hex à parte (gramática modular diferente).
is_hex() { echo "$1" | grep -Eiq '^hex_|^tile_'; }

while IFS= read -r f; do
  b=$(basename "$f" .gltf)
  if is_hex "$b"; then dst="$HEX_DST/$b.glb"; echo "$f" >> "$hexl"
  elif is_removed "$b"; then echo "$f" >> "$rm_l"; continue
  else dst="$BASE_DST/$b.glb"; echo "$f" >> "$base"; fi
  # caminho windows pro Blender (D:/ em vez de /d/)
  win=$(echo "$f" | sed -E 's#^/([a-z])/#\U\1:/#')
  echo "$win|$dst" >> "$combined"
done < <(find "$SRC" -iname '*.gltf')

echo "BASE : $(wc -l < "$base")   HEX : $(wc -l < "$hexl")   REMOV: $(wc -l < "$rm_l")"
echo "--- amostra REMOVIDOS (confira; ajuste is_removed se algo útil caiu) ---"
xargs -I{} basename {} .gltf < "$rm_l" 2>/dev/null | sort | head -60
echo "--- convert_list: $combined ($(wc -l < "$combined") linhas) ---"
