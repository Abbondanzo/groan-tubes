// Seasonal easter-egg sounds. Each one appears on its own in season (by the phone's
// local date) and can be unlocked any day from the browser console:
//
//   groanTubes.help()
//   groanTubes.unlock("ghost")   // or "santa", or "all"
//   groanTubes.lock("all")
//
// Unlocks are remembered on this device.
import { PRESETS, type Preset } from "./audio";

interface Seasonal extends Preset {
  emoji: string;
  /** In season on these [month (1-12), day] dates, local time. */
  dates: [number, number][];
}

export const SEASONAL: Seasonal[] = [
  {
    id: "ghost",
    name: "Ghost",
    emoji: "👻",
    dates: [[10, 31]],
    // A hollow, wavering "wooOOooo": a pure, high reed in a soft, gently resonant tube.
    pitch: 470,
    tube: 0.45,
    resonance: 0.6,
    damping: 0.55,
    rolloff: 2.4,
    level: 0.3,
    reverse: { pitch: 0.92, level: 0.9 },
    drift: -0.22,
    vibrato: { rate: 5.5, depth: 0.035 },
  },
  {
    id: "santa",
    name: "Santa",
    emoji: "🎅",
    dates: [
      [12, 24],
      [12, 25],
    ],
    // Deep and jolly: every flip is three "ho"s, and the weight lands with sleigh bells.
    pitch: 118,
    tube: 0.55,
    resonance: 0.8,
    damping: 0.35,
    rolloff: 0.7,
    level: 1.3,
    reverse: { pitch: 0.97, level: 0.9 },
    drift: -0.06,
    pulses: 3,
    impact: "jingle",
  },
];

const UNLOCK_KEY = "groan-tubes:unlocked";
const unlocked = new Set<string>(readUnlocked());

function readUnlocked(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(UNLOCK_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeUnlocked() {
  try {
    localStorage.setItem(UNLOCK_KEY, JSON.stringify([...unlocked]));
  } catch {
    /* private mode: unlock lasts for this visit */
  }
}

export function inSeason(p: Seasonal, now = new Date()): boolean {
  const m = now.getMonth() + 1;
  const d = now.getDate();
  return p.dates.some(([pm, pd]) => pm === m && pd === d);
}

/** Every preset to show right now: the regulars, then any seasonal ones that are on. */
export function availablePresets(now = new Date()): Preset[] {
  return [...PRESETS, ...SEASONAL.filter((p) => inSeason(p, now) || unlocked.has(p.id))];
}

export function chipLabel(p: Preset): string {
  const s = SEASONAL.find((x) => x.id === p.id);
  return s ? `${s.emoji} ${p.name}` : p.name;
}

/**
 * Install `window.groanTubes` for unlocking from the console.
 * @param onChange called after an unlock or lock so the UI can redraw its buttons
 */
export function installConsoleApi(onChange: () => void) {
  const ids = SEASONAL.map((p) => p.id);
  const pick = (id: string): string[] | null => {
    if (id === "all") return ids;
    if (ids.includes(id)) return [id];
    console.warn(`Unknown sound "${id}". Try one of: ${ids.join(", ")}, or "all".`);
    return null;
  };

  const api = {
    help() {
      console.log(
        [
          "Groan Tubes secret sounds:",
          ...SEASONAL.map((p) => {
            const when = p.dates.map(([m, d]) => `${m}/${d}`).join(" & ");
            return `  ${p.emoji} ${p.id.padEnd(6)} ${when}${unlocked.has(p.id) ? " · unlocked" : ""}`;
          }),
          "",
          '  groanTubes.unlock("ghost" | "santa" | "all")',
          '  groanTubes.lock("ghost" | "santa" | "all")',
          "  groanTubes.list()",
        ].join("\n"),
      );
    },
    unlock(id = "all") {
      const which = pick(id);
      if (!which) return;
      which.forEach((x) => unlocked.add(x));
      writeUnlocked();
      onChange();
      return `Unlocked ${which.join(", ")}. Look for ${which.map((x) => SEASONAL.find((p) => p.id === x)!.emoji).join(" ")} under the tube.`;
    },
    lock(id = "all") {
      const which = pick(id);
      if (!which) return;
      which.forEach((x) => unlocked.delete(x));
      writeUnlocked();
      onChange();
      return `Locked ${which.join(", ")}. They'll still show up in season.`;
    },
    list() {
      return availablePresets().map((p) => p.id);
    },
  };

  (window as unknown as { groanTubes: typeof api }).groanTubes = api;
  console.log(
    "%c👻🎅 Psst. There are secret sounds. Try groanTubes.help()",
    "color:#f5a524;font-family:monospace",
  );
}
