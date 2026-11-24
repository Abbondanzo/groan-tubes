// Lifetime groan stats, kept in localStorage on this device.

const KEY = "groan-tubes:stats";
/** A sound has to last this long to count as a groan (filters out tiny tilts). */
const MIN_GROAN_S = 0.25;
/** Groan counts worth celebrating, smallest first. */
export const MILESTONES = [100, 1000, 10000] as const;
export type Milestone = (typeof MILESTONES)[number];

export interface StatsData {
  version: 1;
  /** When the first groan was counted (ISO date). */
  since: string | null;
  groans: number;
  byPreset: Record<string, number>;
  /** Total seconds of sound. */
  seconds: number;
  longest: number;
  /** Fastest the weight has hit an end cap, m/s. */
  topSpeed: number;
  /** Metres the weight has slid while the app was running. */
  distance: number;
  /** Most groans in any 60 s window. */
  bestMinute: number;
  today: { date: string; count: number };
}

const fresh = (): StatsData => ({
  version: 1,
  since: null,
  groans: 0,
  byPreset: {},
  seconds: 0,
  longest: 0,
  topSpeed: 0,
  distance: 0,
  bestMinute: 0,
  today: { date: dayKey(), count: 0 },
});

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export class Stats {
  data: StatsData;
  private current = 0; // seconds into the groan in progress
  private recent: number[] = []; // timestamps (s) of groans in the last minute
  private dirty = false;
  private lastSave = 0;
  /** Called when a groan brings the total to exactly a milestone. */
  onMilestone?: (n: Milestone) => void;

  constructor() {
    this.data = load();
  }

  /**
   * Call every frame.
   * @param sounding whether the voice is making sound right now
   * @param slideMetres how far the weight moved this frame
   */
  tick(dt: number, now: number, sounding: boolean, slideMetres: number, presetId: string) {
    const d = this.data;
    d.distance += slideMetres;
    if (slideMetres > 0) this.dirty = true;

    if (sounding) {
      this.current += dt;
      d.seconds += dt;
      if (this.current > d.longest) d.longest = this.current;
    } else if (this.current > 0) {
      if (this.current >= MIN_GROAN_S) this.countGroan(now, presetId);
      this.current = 0;
    }

    if (this.dirty && now - this.lastSave > 2) this.save(now);
  }

  /** The weight hit an end cap at this speed (m/s). */
  impact(speed: number) {
    if (speed > this.data.topSpeed) {
      this.data.topSpeed = speed;
      this.dirty = true;
    }
  }

  private countGroan(now: number, presetId: string) {
    const d = this.data;
    d.groans++;
    d.byPreset[presetId] = (d.byPreset[presetId] ?? 0) + 1;
    d.since ??= new Date().toISOString();

    const today = dayKey();
    if (d.today.date !== today) d.today = { date: today, count: 0 };
    d.today.count++;

    this.recent.push(now);
    while (this.recent.length && now - this.recent[0] > 60) this.recent.shift();
    if (this.recent.length > d.bestMinute) d.bestMinute = this.recent.length;
    this.dirty = true;

    const hit = MILESTONES.find((m) => m === d.groans);
    if (hit) {
      this.save(now); // don't lose a milestone groan to a crash or a closed tab
      this.onMilestone?.(hit);
    }
  }

  /** Groans counted today (rolls over at local midnight). */
  get todayCount() {
    return this.data.today.date === dayKey() ? this.data.today.count : 0;
  }

  save(now = performance.now() / 1000) {
    this.lastSave = now;
    this.dirty = false;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode or storage full: stats just won't persist */
    }
  }

  reset() {
    this.data = fresh();
    this.current = 0;
    this.recent = [];
    this.save();
  }
}

function load(): StatsData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<StatsData>;
    if (parsed.version !== 1) return fresh();
    return { ...fresh(), ...parsed, byPreset: { ...parsed.byPreset } };
  } catch {
    return fresh();
  }
}

// ---------- formatting ----------

export function formatDuration(s: number): string {
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${Math.floor(s % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatDistance(m: number): string {
  if (m < 1) return `${Math.round(m * 100)} cm`;
  if (m < 1000) return `${m.toFixed(m < 10 ? 1 : 0)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

/** A silly real-world comparison for the distance slid. */
export function distanceFact(m: number): string {
  if (m < 0.5) return "Flip it a few more times.";
  const things: [number, string, string][] = [
    [0.3, "banana", "bananas"],
    [1.8, "person", "people"],
    [5, "giraffe", "giraffes"],
    [12, "school bus", "school buses"],
    [25, "blue whale", "blue whales"],
    [100, "football field", "football fields"],
    [330, "Eiffel Tower", "Eiffel Towers"],
  ];
  let pick = things[0];
  for (const t of things) if (m >= t[0]) pick = t;
  const n = m / pick[0];
  const count = n >= 10 ? Math.round(n).toString() : n.toFixed(1);
  return `That's about ${count} ${n >= 0.95 && n < 1.05 ? pick[1] : pick[2]} laid end to end.`;
}

export function formatSince(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
