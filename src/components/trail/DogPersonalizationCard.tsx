/**
 * Human-readable Dog Personalization section. No JSON, no toggles — all content visible.
 */

export type DogPersonalizationCardProps = {
  smallDogScore?: number;
  highEnergyScore?: number;
  seniorSafeScore?: number;
  heatSensitiveLevel?: "low" | "medium" | "high";
  smallDogReasons?: string[];
  highEnergyReasons?: string[];
  seniorSafeReasons?: string[];
  heatSensitiveReasons?: string[];
};

function scorePct(score: number | undefined): number {
  if (score == null || !Number.isFinite(score)) return 0;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

function Block({
  title,
  score,
  reasons,
}: {
  title: string;
  score: number | undefined;
  reasons: string[] | undefined;
}) {
  const hasScore = score != null && Number.isFinite(score);
  const hasReasons = Array.isArray(reasons) && reasons.length > 0;
  if (!hasScore && !hasReasons) return null;

  const pct = scorePct(score);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1f2937" }}>
        {title}
      </h3>
      {hasScore && (
        <>
          <p style={{ fontSize: "0.875rem", color: "#374151" }}>
            Suitability Score: {(score ?? 0).toFixed(1)} / 1.0
          </p>
          <div
            style={{
              height: "0.5rem",
              width: "100%",
              overflow: "hidden",
              borderRadius: "9999px",
              backgroundColor: "#e5e7eb",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                borderRadius: "9999px",
                backgroundColor: "#10b981",
              }}
            />
          </div>
        </>
      )}
      {hasReasons && (
        <ul
          style={{
            listStyle: "disc",
            listStylePosition: "inside",
            fontSize: "0.875rem",
            color: "#4b5563",
            margin: 0,
            paddingLeft: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          {reasons!.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DogPersonalizationCard({
  smallDogScore,
  highEnergyScore,
  seniorSafeScore,
  heatSensitiveLevel,
  smallDogReasons,
  highEnergyReasons,
  seniorSafeReasons,
  heatSensitiveReasons,
}: DogPersonalizationCardProps) {
  const hasSmall =
    (smallDogScore != null && Number.isFinite(smallDogScore)) ||
    (Array.isArray(smallDogReasons) && smallDogReasons.length > 0);
  const hasHighEnergy =
    (highEnergyScore != null && Number.isFinite(highEnergyScore)) ||
    (Array.isArray(highEnergyReasons) && highEnergyReasons.length > 0);
  const hasSenior =
    (seniorSafeScore != null && Number.isFinite(seniorSafeScore)) ||
    (Array.isArray(seniorSafeReasons) && seniorSafeReasons.length > 0);
  const hasHeat =
    heatSensitiveLevel != null ||
    (Array.isArray(heatSensitiveReasons) && heatSensitiveReasons.length > 0);

  if (!hasSmall && !hasHighEnergy && !hasSenior && !hasHeat) {
    return null;
  }

  const levelLabel =
    heatSensitiveLevel != null
      ? heatSensitiveLevel.charAt(0).toUpperCase() + heatSensitiveLevel.slice(1)
      : null;

  return (
    <div
      style={{
        borderRadius: "0.5rem",
        border: "1px solid #e5e7eb",
        backgroundColor: "rgba(249, 250, 251, 0.8)",
        padding: "1rem",
        boxShadow: "0 1px 2px 0 rgba(0,0,0,0.05)",
      }}
    >
      <h2
        style={{
          marginBottom: "1rem",
          fontSize: "1rem",
          fontWeight: 600,
          color: "#111827",
        }}
      >
        🐕 Dog Personalization
      </h2>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {hasSmall && (
          <Block
            title="1️⃣ Small Dogs"
            score={smallDogScore}
            reasons={smallDogReasons}
          />
        )}
        {hasHighEnergy && (
          <Block
            title="2️⃣ High-Energy Dogs"
            score={highEnergyScore}
            reasons={highEnergyReasons}
          />
        )}
        {hasSenior && (
          <Block
            title="3️⃣ Senior Dogs"
            score={seniorSafeScore}
            reasons={seniorSafeReasons}
          />
        )}
        {hasHeat && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <h3
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#1f2937",
              }}
            >
              4️⃣ Heat Sensitivity
            </h3>
            {levelLabel != null && (
              <p style={{ fontSize: "0.875rem", color: "#374151" }}>
                Heat Risk Level: {levelLabel}
              </p>
            )}
            {Array.isArray(heatSensitiveReasons) &&
              heatSensitiveReasons.length > 0 && (
                <ul
                  style={{
                    listStyle: "disc",
                    listStylePosition: "inside",
                    fontSize: "0.875rem",
                    color: "#4b5563",
                    margin: 0,
                    paddingLeft: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                  }}
                >
                  {heatSensitiveReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
