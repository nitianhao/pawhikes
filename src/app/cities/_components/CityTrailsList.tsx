"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { computeMatch, type DogProfile } from "@/lib/match/dogProfileMatch";

type TrailSystem = Record<string, any>;

const PROFILES: { label: string; value: DogProfile }[] = [
  { label: "Balanced", value: "balanced" },
  { label: "Senior", value: "senior" },
  { label: "Small", value: "small" },
  { label: "Heat-sensitive", value: "heat_sensitive" },
  { label: "High-energy", value: "high_energy" },
];

function badge(text: string): React.ReactNode {
  return (
    <span
      style={{
        display: "inline-block",
        border: "1px solid #d1d5db",
        borderRadius: "999px",
        fontSize: "0.75rem",
        padding: "0.15rem 0.45rem",
        marginRight: "0.35rem",
        marginBottom: "0.35rem",
      }}
    >
      {text}
    </span>
  );
}

export default function CityTrailsList({
  cityLabel,
  systems,
}: {
  cityLabel: string;
  systems: TrailSystem[];
}) {
  const [profile, setProfile] = useState<DogProfile>("balanced");

  const ranked = useMemo(() => {
    return systems
      .map((system) => ({
        system,
        match: computeMatch(system, profile),
      }))
      .sort((a, b) => b.match.score - a.match.score);
  }, [systems, profile]);

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "1.25rem" }}>
      <h1 style={{ marginBottom: "0.4rem" }}>{cityLabel} Trails</h1>

      <div style={{ marginBottom: "0.9rem" }}>
        {PROFILES.map((p) => {
          const active = p.value === profile;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => setProfile(p.value)}
              style={{
                border: active ? "1px solid #111827" : "1px solid #d1d5db",
                background: active ? "#111827" : "#ffffff",
                color: active ? "#ffffff" : "#111827",
                borderRadius: "999px",
                padding: "0.3rem 0.6rem",
                marginRight: "0.45rem",
                marginBottom: "0.45rem",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {ranked.map(({ system, match }) => (
          <article
            key={String(system.id)}
            style={{ border: "1px solid #e5e7eb", borderRadius: "0.75rem", padding: "0.8rem" }}
          >
            <h3 style={{ margin: 0 }}>
              <Link href={`/trails/${String(system.slug ?? "")}`}>{String(system.name ?? "Unnamed")}</Link>
            </h3>
            <p style={{ margin: "0.25rem 0", color: "#4b5563", fontSize: "0.92rem" }}>
              Match: {match.score.toFixed(2)} - {match.reasons.slice(0, 2).join(" + ")}
            </p>
            <div>{match.warnings.map((w) => badge(w))}</div>
          </article>
        ))}
      </div>
    </main>
  );
}
