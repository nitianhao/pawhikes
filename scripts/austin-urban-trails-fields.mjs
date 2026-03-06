#!/usr/bin/env node
/**
 * Introspect Austin Urban Trails (jdwm-wfps) schema: print field names and detected candidates.
 */

const URL = "https://data.austintexas.gov/resource/jdwm-wfps.json?$limit=1";

async function main() {
  let res;
  try {
    res = await fetch(URL);
  } catch (err) {
    console.error("Fetch error:", err.message);
    process.exit(1);
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error("JSON parse error:", err.message);
    process.exit(1);
  }
  if (!Array.isArray(data) || data.length === 0) {
    console.error("No records returned");
    process.exit(1);
  }

  const keys = Object.keys(data[0]).sort((a, b) => a.localeCompare(b));
  console.log("Top-level keys (alphabetical):");
  keys.forEach((k) => console.log(`  ${k}`));

  const row = data[0];

  const nameTitle = keys.filter(
    (k) =>
      k === "name" ||
      k === "title" ||
      k.toLowerCase().includes("name") ||
      k.toLowerCase().includes("title")
  );
  const lengthDist = keys.filter((k) => {
    const l = k.toLowerCase();
    return l.includes("length") || l.includes("miles") || l.includes("feet") || l.includes("distance") || l.includes("meters");
  });
  const surface = keys.filter((k) =>
    ["surface", "trail_surface", "pavement", "material"].some((t) =>
      k.toLowerCase().includes(t)
    )
  );
  const typeClass = keys.filter((k) =>
    ["type", "class", "facility", "kind", "category"].some((t) =>
      k.toLowerCase().includes(t)
    )
  );
  const status = keys.filter((k) =>
    ["status", "state", "build", "phase", "open"].some((t) =>
      k.toLowerCase().includes(t)
    )
  );
  const modality = keys.filter((k) =>
    ["bike", "ped", "use", "modality", "mode"].some((t) =>
      k.toLowerCase().includes(t)
    )
  );
  const geometry = keys.filter((k) =>
    ["geom", "geometry", "shape", "geo"].some((t) =>
      k.toLowerCase().includes(t)
    )
  );

  console.log("\nDetected candidate fields:");
  console.log("  name/title:", nameTitle.length ? nameTitle.join(", ") : "(none)");
  console.log("  length/distance/miles/feet:", lengthDist.length ? lengthDist.join(", ") : "(none)");
  console.log("  surface:", surface.length ? surface.join(", ") : "(none)");
  console.log("  type/class:", typeClass.length ? typeClass.join(", ") : "(none)");
  console.log("  status:", status.length ? status.join(", ") : "(none)");
  console.log("  modality/use (bike/ped):", modality.length ? modality.join(", ") : "(none)");
  console.log("  geometry:", geometry.length ? geometry.join(", ") : "(none)");
}

main();
