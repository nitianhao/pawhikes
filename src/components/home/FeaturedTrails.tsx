import { TrailCard, type TrailCardData } from "@/components/home/TrailCard";

export function FeaturedTrails({ trails }: { trails: TrailCardData[] }) {
  return (
    <section
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        background: "#fff",
        padding: "1.25rem",
      }}
    >
      <div style={{ marginBottom: "0.875rem" }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.25rem", color: "#111827" }}>
          Dog-Friendly Trail Picks to Start With
        </h2>
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          Trail detail pages include leash policy, shade, water access, and surface context.
        </p>
      </div>

      {trails.length === 0 ? (
        <p style={{ color: "#4b5563" }}>No trails available yet.</p>
      ) : (
        <div className="featured-trails-grid">
          {trails.map((trail) => (
            <TrailCard key={trail.id} trail={trail} />
          ))}
        </div>
      )}
    </section>
  );
}
