#!/usr/bin/env bash
# R1.6 phase 0 (SPEC-0585): mean of the render sections of a round's perf trace, and the split.
# Usage: render-sections.sh <roundDir>...   -> one line per round (ms per frame)
for d in "$@"; do
  node -e '
    const fs = require("fs");
    const keys = ["render", "mirror", "sceneRender", "nativeProject", "nativeCull", "nativeEmit"];
    const sum = Object.fromEntries(keys.map((k) => [k, 0])); let n = 0;
    for (const l of fs.readFileSync(process.argv[1] + "/perf-trace.jsonl", "utf8").split("\n")) {
      let row; try { row = JSON.parse(l); } catch { continue; }
      if (!row.cpuAvg || !(row.t >= 30000)) continue; // the kit warm-up rule (trace-stats.mjs WARMUP_MS)
      const c = row.cpuAvg; if (c.render === undefined) continue;
      n++; for (const k of keys) sum[k] += c[k] || 0;
    }
    const a = Object.fromEntries(keys.map((k) => [k, sum[k] / Math.max(n, 1)]));
    const f = (v) => v.toFixed(2);
    const loop = a.nativeProject - a.nativeCull, three = a.sceneRender - a.nativeProject - a.nativeEmit, post = a.render - a.mirror - a.sceneRender;
    console.log(`${require("path").basename(process.argv[1])} n=${n} | render ${f(a.render)} = mirror ${f(a.mirror)} + cena ${f(a.sceneRender)} [cull C++ ${f(a.nativeCull)} + laço JS ${f(loop)} + emissão ${f(a.nativeEmit)} + three ${f(three)}] + pós/resto ${f(post)}`);
  ' "$d"
done
