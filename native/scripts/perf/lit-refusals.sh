#!/usr/bin/env bash
# Lit-model refusals named by the census (SPEC-0535): per round, the summed `lit` counts of the
# rendererCensus samples and the refused materials with their reason. One line per round.
# Usage: lit-refusals.sh <roundDir>...   (each with a perf-trace.jsonl from ?rendererCensus=1)
for d in "$@"; do
  node -e '
    const fs = require("fs");
    const lines = fs.readFileSync(process.argv[1] + "/perf-trace.jsonl", "utf8").split("\n");
    const sum = new Map(); const mats = new Map(); let samples = 0;
    for (const l of lines) {
      const lit = /"lit":"([^"]*)"/.exec(l);
      if (!lit) continue;
      if (l.includes("\"classes\"")) {
        samples++;
        for (const p of lit[1].split(";").filter(Boolean)) { const [k, n] = p.split("="); sum.set(k, (sum.get(k) || 0) + Number(n)); }
      } else if (lit[1]) {
        const name = (/"name":"([^"]*)"/.exec(l) || [])[1] || "?";
        mats.set(name, lit[1]);
      }
    }
    let built = "";
    for (const l of lines) { const b = /"litBuilt":"([^"]*)"/.exec(l); if (b) built = b[1]; }
    const per = [...sum].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${(n / Math.max(samples, 1)).toFixed(1)}`).join(" ");
    const names = [...mats].map(([n, w]) => `${n}(${w})`).join(" ");
    console.log(`${require("path").basename(process.argv[1])}: ${samples} amostras | por amostra: ${per || "nenhum"} | materiais: ${names || "-"} | recusas na criação: ${built || "nenhuma"}`);
  ' "$d"
done
