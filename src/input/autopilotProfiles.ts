/**
 * Built-in autopilot profiles (SPEC-0414): plain data, one loop of Xbox inputs each.
 * `walk` keeps every move paired with its opposite so the player loops near the spawn. Camera turns
 * are yaw only (right stick X): pitch stays at the game's default, looking at the street — a camera
 * pointed at the sky renders almost nothing and would hide the drops being measured.
 * `drive` is closed loop (SPEC-0595): one `driver` step, the game's registered driver steers.
 * `drive-legacy` is the old open-loop script, kept only as the known answer of the kit's drive rule.
 */
import type { AutopilotProfile } from './InputAutopilot.js';

export const AUTOPILOT_PROFILES: Record<string, AutopilotProfile> = {
  "walk": {
    "steps": [
      { "s": 5, "axes": { "leftY": -1 } },
      { "s": 5, "axes": { "leftY": 1 } },
      { "s": 2.4, "axes": { "rightX": 1 } },
      { "s": 0.2, "buttons": ["A"] },
      { "s": 0.8 },
      { "s": 0.2, "buttons": ["A"] },
      { "s": 0.8 },
      { "s": 0.2, "buttons": ["A"] },
      { "s": 0.8 },
      { "s": 0.6, "buttons": ["LT"] },
      { "s": 1.5, "buttons": ["LT", "RT"] },
      { "s": 0.5 },
      { "s": 4, "buttons": ["RT"], "axes": { "leftY": -1 } },
      { "s": 4, "buttons": ["RT"], "axes": { "leftY": 1 } },
      { "s": 0.8, "axes": { "leftY": -1, "leftX": 1 } },
      { "s": 0.8, "axes": { "leftY": -1, "leftX": -1 } },
      { "s": 0.8, "axes": { "leftY": -1, "leftX": 1 } },
      { "s": 0.8, "axes": { "leftY": -1, "leftX": -1 } },
      { "s": 0.8, "axes": { "leftY": 1, "leftX": 1 } },
      { "s": 0.8, "axes": { "leftY": 1, "leftX": -1 } },
      { "s": 0.8, "axes": { "leftY": 1, "leftX": 1 } },
      { "s": 0.8, "axes": { "leftY": 1, "leftX": -1 } },
      { "s": 2.4, "axes": { "rightX": -1 } },
      { "s": 1 }
    ]
  },
  "drive": {
    "steps": [
      { "s": 60, "driver": true }
    ]
  },
  "drive-legacy": {
    "steps": [
      { "s": 3, "buttons": ["RT"] },
      { "s": 4, "buttons": ["RT"], "axes": { "leftX": -1 } },
      { "s": 4, "buttons": ["RT"], "axes": { "leftX": 1 } },
      { "s": 2, "buttons": ["RT"], "axes": { "rightX": 1 } },
      { "s": 1.5, "buttons": ["LT"] },
      { "s": 2, "buttons": ["LT"], "axes": { "leftX": 1 } },
      { "s": 1 },
      { "s": 0.2, "buttons": ["Y"] },
      { "s": 2.5 },
      { "s": 0.2, "buttons": ["Y"] },
      { "s": 2 }
    ]
  }
};
