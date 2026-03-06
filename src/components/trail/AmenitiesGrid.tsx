type AmenitiesCounts = Record<string, unknown>;

type AmenityCard = {
  key: string;
  icon: string;
  label: string;
  count: number;
  helper: string;
  muted?: boolean;
  hideWhenZero?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return 0;
}

function mapAmenities(countsRaw: unknown): AmenityCard[] {
  const counts = (asRecord(countsRaw) ?? {}) as AmenitiesCounts;

  const benches = asCount(counts.bench);
  const shelters = asCount(counts.shelter);
  const toilets = asCount(counts.toilets);
  const information = asCount(counts.information);
  const picnicTables = asCount(counts.picnic_table);
  const wasteBaskets = asCount(counts.waste_basket);
  const drinkingWater = asCount(counts.drinking_water);

  const cards: AmenityCard[] = [
    {
      key: "bench",
      icon: "🪑",
      label: "Benches",
      count: benches,
      helper:
        benches > 10
          ? "Plenty of resting spots"
          : benches > 0
            ? "Some resting spots"
            : "None reported",
      hideWhenZero: true,
    },
    {
      key: "shelter",
      icon: "🏠",
      label: "Shelters",
      count: shelters,
      helper: shelters > 0 ? "Covered areas available" : "None reported",
      hideWhenZero: true,
    },
    {
      key: "toilets",
      icon: "🚻",
      label: "Restrooms",
      count: toilets,
      helper: toilets > 0 ? "Public toilets available" : "None reported",
      muted: toilets === 0,
      hideWhenZero: false,
    },
    {
      key: "information",
      icon: "ℹ️",
      label: "Trail Information",
      count: information,
      helper: information > 0 ? "Signage or info boards" : "None reported",
      hideWhenZero: true,
    },
    {
      key: "picnic_table",
      icon: "🍽️",
      label: "Picnic Tables",
      count: picnicTables,
      helper: picnicTables > 0 ? "Good for breaks" : "None reported",
      hideWhenZero: true,
    },
    {
      key: "waste_basket",
      icon: "🗑️",
      label: "Waste Bins",
      count: wasteBaskets,
      helper: wasteBaskets > 0 ? "Dog waste disposal available" : "Bring waste bags",
      muted: wasteBaskets === 0,
      hideWhenZero: false,
    },
    {
      key: "drinking_water",
      icon: "💧",
      label: "Drinking Water",
      count: drinkingWater,
      helper: drinkingWater > 0 ? "Water access along trail" : "No water reported",
      muted: drinkingWater === 0,
      hideWhenZero: false,
    },
  ];

  return cards.filter((card) => !(card.hideWhenZero && card.count === 0));
}

function buildSummary(cards: AmenityCard[]): string[] {
  const byKey = new Map(cards.map((card) => [card.key, card]));
  const water = byKey.get("drinking_water")?.count ?? 0;
  const toilets = byKey.get("toilets")?.count ?? 0;
  const benches = byKey.get("bench")?.count ?? 0;
  const picnic = byKey.get("picnic_table")?.count ?? 0;
  const shelters = byKey.get("shelter")?.count ?? 0;
  const information = byKey.get("information")?.count ?? 0;
  const waste = byKey.get("waste_basket")?.count ?? 0;

  const visiblePositive =
    Number(water > 0) +
    Number(toilets > 0) +
    Number(benches > 0) +
    Number(picnic > 0) +
    Number(shelters > 0) +
    Number(information > 0) +
    Number(waste > 0);

  const messages: string[] = [];
  if (water > 0 || toilets > 0) {
    messages.push("Well-equipped for longer walks");
  }
  if (benches + picnic > 5) {
    messages.push("Comfortable for extended breaks");
  }
  if (visiblePositive <= 1) {
    messages.push("Minimal facilities - plan ahead");
  }

  return messages.slice(0, 2);
}

type AmenitiesGridProps = {
  amenitiesCounts: unknown;
};

export function AmenitiesGrid({ amenitiesCounts }: AmenitiesGridProps) {
  const cards = mapAmenities(amenitiesCounts);
  const summary = buildSummary(cards);

  return (
    <section
      style={{
        marginTop: "1.25rem",
        border: "1px solid #e5e7eb",
        borderRadius: "1rem",
        padding: "0.9rem",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Amenities on the Trail</h2>
      <p style={{ marginTop: "0.2rem", color: "#6b7280", fontSize: "0.9rem" }}>
        What you&apos;ll find along the route
      </p>

      {summary.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "0.55rem" }}>
          {summary.map((item) => (
            <span
              key={item}
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "9999px",
                backgroundColor: "#ecfdf5",
                color: "#065f46",
                border: "1px solid #a7f3d0",
                padding: "0.3rem 0.65rem",
                fontSize: "0.82rem",
                fontWeight: 600,
              }}
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}

      <div
        style={{
          marginTop: "0.75rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "0.6rem",
        }}
      >
        {cards.map((card) => (
          <article
            key={card.key}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "1rem",
              background: card.muted ? "#f9fafb" : "#f3f4f6",
              opacity: card.muted ? 0.65 : 1,
              padding: "0.75rem",
            }}
          >
            <div style={{ fontSize: "1.8rem", lineHeight: 1 }}>{card.icon}</div>
            <p style={{ margin: "0.45rem 0 0", fontSize: "1.35rem", fontWeight: 800, color: "#111827" }}>
              {card.count}
            </p>
            <p style={{ margin: "0.2rem 0 0", fontWeight: 700, color: "#111827" }}>{card.label}</p>
            <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.82rem" }}>{card.helper}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
