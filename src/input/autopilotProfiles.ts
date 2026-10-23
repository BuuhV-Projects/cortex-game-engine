/**
 * Built-in autopilot profiles (SPEC-0414): plain data, one loop of Xbox inputs each.
 * `walk` keeps every move paired with its opposite so the player loops near the spawn.
 */
import type { AutopilotProfile } from './InputAutopilot.js';

export const AUTOPILOT_PROFILES: Record<string, AutopilotProfile> = {
  "walk": {
    "steps": [
      { "s": 3, "axes": { "leftY": -1 } },
      { "s": 3, "axes": { "leftY": 1 } },
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
      { "s": 2, "buttons": ["RT"], "axes": { "leftY": -1 } },
      { "s": 2, "buttons": ["RT"], "axes": { "leftY": 1 } },
      { "s": 0.8, "axes": { "leftY": -1, "leftX": 1 } },
      { "s": 0.8, "axes": { "leftY": -1, "leftX": -1 } },
      { "s": 0.8, "axes": { "leftY": -1, "leftX": 1 } },
      { "s": 0.8, "axes": { "leftY": -1, "leftX": -1 } },
      { "s": 0.8, "axes": { "leftY": 1, "leftX": 1 } },
      { "s": 0.8, "axes": { "leftY": 1, "leftX": -1 } },
      { "s": 0.8, "axes": { "leftY": 1, "leftX": 1 } },
      { "s": 0.8, "axes": { "leftY": 1, "leftX": -1 } },
      { "s": 2.4, "axes": { "rightX": -1, "rightY": -0.5 } },
      { "s": 1 }
    ]
  },
  "drive": {
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
