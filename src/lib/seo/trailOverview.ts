/**
 * Deterministic, zero-cost per-trail overview composer.
 *
 * Goal: produce genuinely differentiated prose (not a fixed "{name} is a {n}-mile
 * trail" skeleton) so Google stops clustering trail pages as near-duplicates.
 *
 * Differentiation comes from REAL DATA VARIANCE, not phrasing tricks:
 *   - positional facts ("shaded over the first third, then open")
 *   - named features from highlightPoints (unique strings per trail)
 *   - which sentences fire depends on which signals each trail actually has
 *   - lead sentence + descriptor word are chosen by bucketing real values
 *
 * No LLM / no API calls. Pure function over the trailSystems record.
 */

type AnyRecord = Record<string, unknown>;

type ProfilePoint = { d?: unknown };
type ShadePoint = ProfilePoint & { shade?: unknown };
type TypedPoint = ProfilePoint & { type?: unknown };
type SurfacePoint = ProfilePoint & { surface?: unknown };
type HighlightPoint = ProfilePoint & { kind?: unknown; name?: unknown };

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function cap(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** Stable seed from a string, so phrase variants differ per trail but never change. */
function seedFrom(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministically pick one phrasing variant for this trail. */
function variant(seed: number, salt: number, options: string[]): string {
  return options[(seed + salt) % options.length];
}

function fmtMiles(n: number): string {
  return n % 1 === 0 ? `${n}` : n.toFixed(1);
}

function listToProse(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Bucket a 0..1 fraction position into a readable trail-section phrase. */
function sectionPhrase(fraction: number): string {
  if (fraction < 0.25) return "near the start";
  if (fraction < 0.45) return "in the first stretch";
  if (fraction < 0.6) return "around the midpoint";
  if (fraction < 0.8) return "in the back half";
  return "toward the far end";
}

/** Average a {d, value} profile within thirds; returns [first, middle, last]. */
function thirds(values: { d: number; v: number }[], total: number): [number, number, number] {
  const buckets: number[][] = [[], [], []];
  for (const p of values) {
    const f = total > 0 ? Math.min(0.999, Math.max(0, p.d / total)) : 0;
    buckets[Math.floor(f * 3)].push(p.v);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return [avg(buckets[0]), avg(buckets[1]), avg(buckets[2])];
}

const SURFACE_WORD: Record<string, string> = {
  asphalt: "paved", concrete: "paved", paved: "paved",
  gravel: "gravel", "fine gravel": "fine-gravel", "crushed stone": "crushed-stone",
  compacted: "compacted-dirt", unpaved: "unpaved", dirt: "dirt", ground: "natural",
  grass: "grass", sand: "sand", woodchips: "woodchip", "boards wood": "boardwalk",
};

const WATER_WORD: Record<string, string> = {
  river: "a river", stream: "a creek", lake: "a lake", canal: "a canal", spring: "a spring",
};

function effortPhrase(gainFt: number | null, gradeP90: number | null, miles: number | null): string | null {
  if (gainFt == null && gradeP90 == null) return null;
  // Prefer per-mile gain when available for a fairer descriptor.
  const perMile = gainFt != null && miles && miles > 0 ? gainFt / miles : gainFt;
  if (perMile == null) return null;
  if (perMile < 50) return "nearly flat";
  if (perMile < 120) return "gently rolling";
  if (perMile < 250) return "moderately hilly";
  return "a steady climb";
}

function shadeSentence(system: AnyRecord, total: number, seed: number): string | null {
  const profile = arr<ShadePoint>(system.shadeProfile)
    .map((p) => ({ d: num(p.d) ?? 0, v: num(p.shade) ?? 0 }));
  if (profile.length >= 4) {
    const [a, b, c] = thirds(profile, total);
    const labels = [a, b, c].map((x) => (x >= 0.6 ? "shaded" : x >= 0.3 ? "partly shaded" : "open"));
    const allSame = labels[0] === labels[1] && labels[1] === labels[2];
    if (allSame) {
      if (labels[0] === "shaded") return variant(seed, 1, [
        "Tree cover is consistent for most of the route, so it holds up well on hot afternoons.",
        "Shade stays steady the whole way, making it a solid hot-weather option.",
        "Canopy is reliable end to end — a comfortable choice when it's warm.",
      ]);
      if (labels[0] === "open") return variant(seed, 2, [
        "Most of the trail is exposed with little tree cover, so bring water and go early on warm days.",
        "It runs mostly in the open, so time it for cooler hours and pack water.",
        "Expect sun for most of the route — best done early or late in the day.",
      ]);
      return "Shade is patchy but fairly even along the way.";
    }
    // Describe the transition between the shadiest and most-open sections.
    const idxMax = [a, b, c].indexOf(Math.max(a, b, c));
    const idxMin = [a, b, c].indexOf(Math.min(a, b, c));
    const where = (i: number) => (i === 0 ? "the first third" : i === 1 ? "the middle" : "the final third");
    const tail = variant(seed, 3, [
      "plan a paw-and-water break for the exposed stretch",
      "carry extra water for the open section",
      "the open stretch can get hot midday",
    ]);
    return `Tree cover is strongest through ${where(idxMax)} and thins out across ${where(idxMin)} — ${tail}.`;
  }
  // Fallback to aggregate.
  const pct = num(system.shadeProxyPercent);
  if (pct != null) {
    const p = Math.round((pct <= 1 ? pct * 100 : pct));
    if (p >= 60) return `It stays well shaded (about ${p}% tree cover), a good pick for warmer days.`;
    if (p >= 30) return `Shade is moderate (about ${p}% tree cover), with some exposed sections.`;
    return `It is mostly open (only about ${p}% tree cover), so time it for cooler hours.`;
  }
  return null;
}

function waterSentence(system: AnyRecord, total: number, seed: number): string | null {
  const profile = arr<TypedPoint>(system.waterProfile)
    .map((p) => ({ d: num(p.d) ?? 0, type: str(p.type) ?? "dry" }));
  const swim = system.swimLikely === true;
  const wet = profile.filter((p) => p.type !== "dry");
  const swimTail = variant(seed, 4, [
    " — swim access looks likely for a hot-day cooldown",
    ", with likely swim access to cool off",
    " — a good spot for a warm-day dip",
  ]);
  if (wet.length > 0 && total > 0) {
    // Pick the most prominent water type and where it appears.
    const counts = new Map<string, number>();
    for (const p of wet) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const firstAt = wet.find((p) => p.type === top)?.d ?? wet[0].d;
    const where = sectionPhrase(firstAt / total);
    const noun = WATER_WORD[top] ?? "water";
    return `The route passes ${noun} ${where}${swim ? swimTail : ""}.`;
  }
  const nearPct = num(system.waterNearPercent);
  if (swim) return `There is likely swim access along the way${swimTail.replace(/^ ?[—,] ?/, " — ")}.`;
  if (nearPct != null && (nearPct <= 1 ? nearPct : nearPct / 100) < 0.05) {
    return variant(seed, 5, [
      "There is little water along the route, so pack enough for your dog.",
      "Water is scarce here — bring plenty for your dog.",
      "Carry water; there is not much along the way for your dog.",
    ]);
  }
  return null;
}

// Only kinds that are reliably scenic/notable. "attraction" and "historic" are
// excluded: they carry noise (neighborhoods, cemeteries, street/admin names,
// estate features) that reads as junk in prose. Precision over recall — the
// water/shade/surface sentences still differentiate trails without highlights.
const SCENIC_KINDS = new Set([
  "waterfall", "cave_entrance", "spring", "peak", "viewpoint",
  "arch", "beach", "gorge", "cliff", "rock", "hot_spring", "ruins",
]);
const NON_SCENIC_NAME = /\b(County|Boulevard|Blvd|Avenue|Ave|Highway|Hwy|Parkway|Pkwy)\b|\b(Street|Road|Drive|Lane|Court)$/i;

function highlightsSentence(system: AnyRecord, total: number): string | null {
  const named = arr<HighlightPoint>(system.highlightPoints)
    .map((p) => ({ d: num(p.d), name: str(p.name), kind: str(p.kind)?.toLowerCase() ?? "" }))
    .filter((p) => p.name && SCENIC_KINDS.has(p.kind) && !NON_SCENIC_NAME.test(p.name as string));
  if (named.length === 0) return null;
  // Up to 3 named features with position — strongest anti-duplicate signal.
  const picks = named.slice(0, 3).map((p) => {
    const where =
      p.d != null && total > 0 ? ` (${fmtMiles(p.d)} mi in)` : "";
    return `${p.name}${where}`;
  });
  const lead = named.length === 1 ? "A notable stop is" : "Notable stops include";
  return `${lead} ${listToProse(picks)}.`;
}

function surfaceClause(system: AnyRecord): string | null {
  const profile = arr<SurfacePoint>(system.surfaceProfile)
    .map((p) => str(p.surface))
    .filter((s): s is string => Boolean(s))
    .map((s) => s.toLowerCase())
    .filter((s) => s !== "unknown" && s !== "unmapped");
  // Dedupe on the DISPLAY word so asphalt+concrete don't both surface as "paved".
  const words = [...new Set(profile.map((s) => SURFACE_WORD[s] ?? s))].slice(0, 3);
  if (words.length >= 2) return `with a mix of ${listToProse(words)} tread`;
  if (words.length === 1) return `on mostly ${words[0]} tread`;
  const dominant = str((system.surfaceSummary as AnyRecord | undefined)?.dominant);
  if (dominant && dominant.toLowerCase() !== "unknown") {
    const w = SURFACE_WORD[dominant.toLowerCase()] ?? dominant;
    return `on mostly ${w} tread`;
  }
  return null;
}

function leashSentence(system: AnyRecord, seed: number): string | null {
  const policy = str(system.leashPolicy)?.toLowerCase() ?? "";
  const amenityKinds = new Set(
    arr<{ kind?: unknown }>(system.amenityPoints)
      .map((p) => str(p.kind))
      .filter((k): k is string => Boolean(k))
  );
  const amenityBits: string[] = [];
  if (amenityKinds.has("drinking_water")) amenityBits.push("drinking water");
  if (amenityKinds.has("toilets")) amenityBits.push("restrooms");
  if (amenityKinds.has("dog_waste") || amenityKinds.has("waste_basket")) amenityBits.push("waste stations");
  if (amenityKinds.has("bench")) amenityBits.push("benches");

  let lead: string | null = null;
  if (/off[- ]?leash|leash optional/.test(policy)) {
    lead = variant(seed, 6, [
      "Dogs can be off-leash here where it is permitted",
      "Off-leash is allowed in the permitted areas",
    ]);
  } else if (/on[- ]?leash|required/.test(policy)) {
    lead = variant(seed, 7, [
      "Dogs must stay leashed on this trail",
      "Keep dogs leashed here",
      "Leashes are required on this trail",
    ]);
  } else if (/conditional|varies|seasonal|partial/.test(policy)) {
    lead = "Leash rules vary along this trail, so check posted signage";
  }
  // Unknown/blank policies are skipped rather than printed raw.

  if (!lead && amenityBits.length === 0) return null;
  if (!lead) return `Along the way you'll find ${listToProse(amenityBits)}.`;
  if (amenityBits.length === 0) return `${lead}.`;
  return `${lead}, and you'll find ${listToProse(amenityBits)} along the way.`;
}

/**
 * Returns an array of sentences (caller can join into a paragraph). Empty array
 * if there isn't enough data to say anything distinctive.
 */
export function buildTrailOverview(system: AnyRecord): string[] {
  const name = str(system.name) ?? "This trail";
  const miles = num(system.lengthMilesTotal);
  const total = miles ?? arr<ProfilePoint>(system.shadeProfile).length ?? 1;
  const routeType = str(system.routeType)?.toLowerCase();
  const routeWord =
    routeType === "loop" ? "loop" : routeType === "out_and_back" ? "out-and-back" : "trail";

  const seed = seedFrom(str(system.id) ?? name);
  const effort = effortPhrase(num(system.elevationGainFt), num(system.gradeP90), miles);
  const surface = surfaceClause(system);

  // Opening sentence — assembled from whichever facts exist, so length/shape varies.
  let opening = `${name} is a ${miles != null ? `${fmtMiles(miles)}-mile ` : ""}${routeWord}`;
  if (surface) opening += ` ${surface}`;
  if (effort) opening += `, ${effort}`;
  opening += ".";

  const shade = shadeSentence(system, total, seed);
  const water = waterSentence(system, total, seed);
  const highlights = highlightsSentence(system, total);
  const leash = leashSentence(system, seed);

  // Lead with the strongest distinctive signal so sentence ORDER varies by trail.
  const body: string[] = [];
  if (highlights) body.push(highlights);
  if (water) body.push(water);
  if (shade) body.push(shade);
  if (leash) body.push(leash);

  const sentences = [opening, ...body].map((s) => cap(s.trim())).filter(Boolean);
  // Require at least 3 sentences of real content to be worth rendering.
  return sentences.length >= 3 ? sentences : [];
}
