import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminDbSafe, instantDbMissingEnvMessage } from "@/lib/instant/safeAdmin";

// ─── Types ────────────────────────────────────────────────────────────────────

type Sys = Record<string, any>;

interface SeoSection { a: string; b: string }
interface SeoFaq { q: string; a: string; confidence: "high" | "medium" | "low" }
interface SeoContent {
  sections: {
    intro?: SeoSection;
    atAGlance?: SeoSection;
    trailheadsAccess?: SeoSection;
    difficultyElevation?: SeoSection;
    crowd?: SeoSection;
    surfacePaws?: SeoSection;
    shadeHeat?: SeoSection;
    water?: SeoSection;
    mudConditions?: SeoSection;
    safetyServices?: SeoSection;
    amenities?: SeoSection;
  };
  faqs: SeoFaq[];
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: slug.replace(/-/g, " ") };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confidenceDot(c: SeoFaq["confidence"]) {
  const colors = { high: "#16a34a", medium: "#ca8a04", low: "#dc2626" };
  return (
    <span
      style={{
        display: "inline-block",
        width: "0.55rem",
        height: "0.55rem",
        borderRadius: "50%",
        background: colors[c] ?? colors.low,
        flexShrink: 0,
        marginTop: "0.15rem",
      }}
      title={`Confidence: ${c}`}
    />
  );
}

function SectionText({ text }: { text: string | undefined }) {
  if (!text || text === "Unknown based on available data.") {
    return (
      <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.9rem", fontStyle: "italic" }}>
        No information available.
      </p>
    );
  }
  return (
    <p style={{ margin: 0, fontSize: "0.925rem", lineHeight: 1.65, color: "#374151" }}>
      {text}
    </p>
  );
}

interface CardProps {
  title: string;
  icon?: string;
  accentColor?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

function Card({ title, icon, accentColor = "#15803d", children, style }: CardProps) {
  return (
    <section
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: "0.875rem",
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.55rem",
          padding: "0.65rem 0.9rem",
          background: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {icon && (
          <span
            style={{
              width: "1.6rem",
              height: "1.6rem",
              borderRadius: "50%",
              background: accentColor,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8rem",
              flexShrink: 0,
            }}
          >
            {icon}
          </span>
        )}
        <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#111827" }}>
          {title}
        </h2>
      </div>
      <div style={{ padding: "0.8rem 0.9rem" }}>{children}</div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function TrailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const db = await getAdminDbSafe();
  if (!db) {
    return (
      <main style={{ maxWidth: "52rem", margin: "0 auto", padding: "1.5rem" }}>
        <Link href="/">← Home</Link>
        <p style={{ marginTop: "1rem" }}>{instantDbMissingEnvMessage()}</p>
      </main>
    );
  }

  const res = await db.query({ trailSystems: { $: { limit: 5000 } } });
  const systems = Array.isArray((res as any).trailSystems)
    ? (res as any).trailSystems
    : (res as any).trailSystems?.data ?? [];

  const sys: Sys | undefined = systems.find(
    (s: Sys) => String(s.slug ?? "") === slug
  );
  if (!sys) notFound();

  const seo: SeoContent | null = sys.seoContent ?? null;
  const sec = seo?.sections ?? {};
  const faqs: SeoFaq[] = seo?.faqs ?? [];

  const heroChip = (emoji: string, text: string) => (
    <span
      style={{
        padding: "0.25rem 0.65rem",
        borderRadius: "999px",
        background: "rgba(255,255,255,0.15)",
        border: "1px solid rgba(255,255,255,0.3)",
        fontSize: "0.8rem",
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {emoji} {text}
    </span>
  );

  return (
    <main
      style={{
        maxWidth: "52rem",
        margin: "0 auto",
        padding: "1.25rem 1rem 3rem",
        fontFamily: "var(--font-inter, system-ui, sans-serif)",
      }}
    >
      {/* Breadcrumb */}
      <p style={{ marginBottom: "1rem", fontSize: "0.85rem", color: "#6b7280" }}>
        <Link href="/" style={{ color: "#15803d", textDecoration: "none" }}>
          ← All trails
        </Link>
      </p>

      {/* ── Hero ── */}
      <div
        style={{
          background: "linear-gradient(135deg, #14532d 0%, #166534 100%)",
          borderRadius: "1rem",
          padding: "1.5rem",
          color: "#fff",
          marginBottom: "1rem",
        }}
      >
        <h1 style={{ margin: "0 0 0.3rem", fontSize: "1.55rem", fontWeight: 800, lineHeight: 1.2 }}>
          {String(sys.name ?? slug)}
        </h1>
        <p style={{ margin: "0 0 0.9rem", opacity: 0.75, fontSize: "0.9rem" }}>
          {[sys.city, sys.state].filter(Boolean).join(", ")}
          {sys.lengthMilesTotal
            ? ` · ${Number(sys.lengthMilesTotal).toFixed(1)} mi`
            : ""}
        </p>

        {sec.intro?.a && sec.intro.a !== "Unknown based on available data." && (
          <p style={{ margin: "0 0 1rem", fontSize: "0.95rem", lineHeight: 1.65, opacity: 0.95 }}>
            {sec.intro.a}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {sys.dogsAllowed && heroChip("🐕", `Dogs: ${sys.dogsAllowed}`)}
          {sys.leashPolicy && heroChip("🦮", `Leash: ${sys.leashPolicy}`)}
          {sys.crowdClass && heroChip("👥", `${sys.crowdClass} crowd`)}
          {sys.shadeClass && heroChip("🌳", `${sys.shadeClass} shade`)}
          {sys.mudRisk && heroChip("🌧️", `Mud: ${sys.mudRisk}`)}
        </div>
      </div>

      {/* ── At a Glance ── */}
      {sec.atAGlance && (
        <Card title="At a Glance" icon="📋" accentColor="#15803d" style={{ marginBottom: "1rem" }}>
          <SectionText text={sec.atAGlance.a} />
        </Card>
      )}

      {/* ── Difficulty + Crowd (2-col) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        {sec.difficultyElevation && (
          <Card title="Difficulty & Elevation" icon="⛰️" accentColor="#92400e">
            <SectionText text={sec.difficultyElevation.a} />
          </Card>
        )}
        {sec.crowd && (
          <Card title="Crowds" icon="👥" accentColor="#1d4ed8">
            <SectionText text={sec.crowd.a} />
          </Card>
        )}
      </div>

      {/* ── Trailheads & Access ── */}
      {sec.trailheadsAccess && (
        <Card title="Getting There & Parking" icon="🅿️" accentColor="#1d4ed8" style={{ marginBottom: "1rem" }}>
          <SectionText text={sec.trailheadsAccess.a} />
        </Card>
      )}

      {/* ── Surface ── */}
      {sec.surfacePaws && (
        <Card title="Trail Surface & Paw Safety" icon="🐾" accentColor="#15803d" style={{ marginBottom: "1rem" }}>
          <SectionText text={sec.surfacePaws.a} />
        </Card>
      )}

      {/* ── Shade + Water (2-col) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        {sec.shadeHeat && (
          <Card title="Shade & Heat" icon="☀️" accentColor="#b45309">
            <SectionText text={sec.shadeHeat.a} />
          </Card>
        )}
        {sec.water && (
          <Card title="Water Access" icon="💧" accentColor="#0369a1">
            <SectionText text={sec.water.a} />
          </Card>
        )}
      </div>

      {/* ── Mud + Amenities (2-col) ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
          gap: "1rem",
          marginBottom: "1rem",
        }}
      >
        {sec.mudConditions && (
          <Card title="Mud & Conditions" icon="🌧️" accentColor="#65a30d">
            <SectionText text={sec.mudConditions.a} />
          </Card>
        )}
        {sec.amenities && (
          <Card title="Amenities" icon="🛖" accentColor="#7c3aed">
            <SectionText text={sec.amenities.a} />
          </Card>
        )}
      </div>

      {/* ── Safety & Services ── */}
      {sec.safetyServices && (
        <Card title="Safety & Services" icon="🛡️" accentColor="#dc2626" style={{ marginBottom: "1rem" }}>
          <SectionText text={sec.safetyServices.a} />
        </Card>
      )}

      {/* ── FAQs ── */}
      {faqs.length > 0 && (
        <section
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: "0.875rem",
            overflow: "hidden",
            marginBottom: "1rem",
          }}
        >
          <div
            style={{
              padding: "0.65rem 0.9rem",
              background: "#f9fafb",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              gap: "0.55rem",
            }}
          >
            <span
              style={{
                width: "1.6rem",
                height: "1.6rem",
                borderRadius: "50%",
                background: "#7c3aed",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.75rem",
                flexShrink: 0,
              }}
            >
              ❓
            </span>
            <h2 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700, color: "#111827" }}>
              Frequently Asked Questions
            </h2>
          </div>
          <dl style={{ margin: 0, padding: "0.25rem 0" }}>
            {faqs.map((faq, i) => (
              <div
                key={i}
                style={{
                  padding: "0.75rem 0.9rem",
                  borderBottom: i < faqs.length - 1 ? "1px solid #f3f4f6" : "none",
                }}
              >
                <dt
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.5rem",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    color: "#111827",
                    marginBottom: "0.3rem",
                  }}
                >
                  {confidenceDot(faq.confidence)}
                  {faq.q}
                </dt>
                <dd
                  style={{
                    margin: "0 0 0 1.05rem",
                    fontSize: "0.85rem",
                    lineHeight: 1.6,
                    color: "#374151",
                  }}
                >
                  {faq.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* No content fallback */}
      {!seo && (
        <Card title="Trail Info" icon="ℹ️">
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#6b7280" }}>
            Dogs: {String(sys.dogsAllowed ?? "unknown")} ·{" "}
            Leash: {String(sys.leashPolicy ?? "unknown")} ·{" "}
            Heat: {String(sys.heatRisk ?? "unknown")}
          </p>
        </Card>
      )}
    </main>
  );
}
