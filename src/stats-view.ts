// The stats strip on the main screen, and the full-size stats sheet it opens.
import type { Preset } from "./audio";
import { Stats, distanceFact, formatDistance, formatDuration, formatSince } from "./stats";

interface Tile {
  key: string;
  label: string;
  value: (s: Stats) => string;
}

const TILES: Tile[] = [
  { key: "groans", label: "Groans", value: (s) => s.data.groans.toLocaleString() },
  { key: "today", label: "Today", value: (s) => s.todayCount.toLocaleString() },
  { key: "time", label: "Time groaning", value: (s) => formatDuration(s.data.seconds) },
  { key: "longest", label: "Longest groan", value: (s) => formatDuration(s.data.longest) },
  { key: "speed", label: "Top speed", value: (s) => `${s.data.topSpeed.toFixed(2)} m/s` },
  { key: "minute", label: "Best minute", value: (s) => `${s.data.bestMinute} groans` },
  { key: "distance", label: "Weight slid", value: (s) => formatDistance(s.data.distance) },
  { key: "since", label: "Groaning since", value: (s) => formatSince(s.data.since) },
];

export function mountStatsView(stats: Stats, presets: Preset[]) {
  const strip = el("button", "stats-strip");
  strip.type = "button";
  strip.id = "stats-open";
  strip.setAttribute("aria-haspopup", "dialog");
  const stripText = el("span", "stats-strip-text");
  const stripCta = el("span", "stats-strip-cta");
  stripCta.textContent = "View stats ⤢";
  strip.append(stripText, stripCta);

  const sheet = el("div", "sheet");
  sheet.id = "stats-sheet";
  sheet.hidden = true;
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "stats-title");

  const panel = el("div", "sheet-panel");
  const head = el("header", "sheet-head");
  const title = el("h2");
  title.id = "stats-title";
  title.textContent = "Stats";
  const close = el("button", "sheet-close");
  close.type = "button";
  close.setAttribute("aria-label", "Close stats");
  close.textContent = "✕";
  head.append(title, close);

  const tiles = el("div", "tiles");
  const values = new Map<string, HTMLElement>();
  for (const t of TILES) {
    const tile = el("div", `tile tile-${t.key}`);
    const label = el("span", "label");
    label.textContent = t.label;
    const value = el("span", "tile-value");
    values.set(t.key, value);
    tile.append(label, value);
    tiles.append(tile);
  }

  const fact = el("p", "fact");

  const barsTitle = el("h3", "label");
  barsTitle.textContent = "By sound";
  const bars = el("div", "bars");
  const barEls = presets.map((p) => {
    const row = el("div", "bar-row");
    const name = el("span", "bar-name");
    name.textContent = p.name;
    const track = el("div", "bar-track");
    const fill = el("div", `bar-fill bar-${p.id}`);
    track.append(fill);
    const count = el("span", "bar-count");
    row.append(name, track, count);
    bars.append(row);
    return { id: p.id, fill, count };
  });

  // Two taps to reset, so a stray tap can't wipe everything.
  const reset = el("button", "sheet-reset");
  reset.type = "button";
  let armed: number | undefined;
  const disarm = () => {
    clearTimeout(armed);
    armed = undefined;
    reset.textContent = "Reset stats";
    reset.classList.remove("armed");
  };
  disarm();
  reset.addEventListener("click", () => {
    if (armed === undefined) {
      reset.textContent = "Tap again to reset";
      reset.classList.add("armed");
      armed = window.setTimeout(disarm, 3000);
    } else {
      stats.reset();
      disarm();
      update();
    }
  });

  panel.append(head, tiles, fact, barsTitle, bars, reset);
  sheet.append(panel);
  document.getElementById("app")!.append(sheet);

  let lastFocus: Element | null = null;
  const open = () => {
    lastFocus = document.activeElement;
    sheet.hidden = false;
    update();
    close.focus();
  };
  const hide = () => {
    sheet.hidden = true;
    disarm();
    (lastFocus as HTMLElement | null)?.focus?.();
  };
  strip.addEventListener("click", open);
  close.addEventListener("click", hide);
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) hide(); // tap outside the panel
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !sheet.hidden) hide();
  });

  function update() {
    const d = stats.data;
    stripText.textContent = `${d.groans.toLocaleString()} groans · ${formatDuration(d.seconds)}`;
    if (sheet.hidden) return;
    for (const t of TILES) values.get(t.key)!.textContent = t.value(stats);
    fact.textContent = distanceFact(d.distance);
    const max = Math.max(1, ...presets.map((p) => d.byPreset[p.id] ?? 0));
    for (const b of barEls) {
      const n = d.byPreset[b.id] ?? 0;
      b.fill.style.width = `${(n / max) * 100}%`;
      b.count.textContent = n.toLocaleString();
    }
  }

  update();
  return { strip, update, get open() { return !sheet.hidden; } };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
