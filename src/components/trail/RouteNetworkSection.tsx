export type RouteGraphStats = {
  edgeCount?: number;
  nodeCount?: number;
  deadEndCount?: number;
  componentCount?: number;
  intersectionCount?: number;
};

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Low / Medium / High from intersectionsPer100Nodes: <=3 Low, 3-8 Medium, >8 High */
function gettingLostRisk(intersectionsPer100Nodes: number): "Low" | "Medium" | "High" {
  if (intersectionsPer100Nodes <= 3) return "Low";
  if (intersectionsPer100Nodes <= 8) return "Medium";
  return "High";
}

const GETTING_LOST_CAPTIONS: Record<"Low" | "Medium" | "High", string> = {
  Low: "Few decision points.",
  Medium: "Some junctions.",
  High: "Many junctions—watch your turns.",
};

/** Score: +1 edgesPerNode>=1.6, +1 intersectionsPer100Nodes>=4, -1 deadEndRatio>=0.55, -1 componentCount>=10. Then <=-1 Low, 0 Medium, >=1 High */
function loopPotential(
  edgesPerNode: number,
  intersectionsPer100Nodes: number,
  deadEndRatio: number,
  componentCount: number
): { label: "Low" | "Medium" | "High"; score: number } {
  let score = 0;
  if (edgesPerNode >= 1.6) score += 1;
  if (intersectionsPer100Nodes >= 4) score += 1;
  if (deadEndRatio >= 0.55) score -= 1;
  if (componentCount >= 10) score -= 1;
  const label = score <= -1 ? "Low" : score >= 1 ? "High" : "Medium";
  return { label, score };
}

const LOOP_POTENTIAL_CAPTIONS: Record<"Low" | "Medium" | "High", string> = {
  Low: "Lots of spurs and backtracking.",
  Medium: "Some loop options.",
  High: "Many ways to link into loops.",
};

/** 1 => Low, 2-4 => Medium, >=5 => High */
function chooseStartMatters(componentCount: number): "Low" | "Medium" | "High" {
  if (componentCount <= 1) return "Low";
  if (componentCount <= 4) return "Medium";
  return "High";
}

const CHOOSE_START_CAPTIONS: Record<"Low" | "Medium" | "High", string> = {
  Low: "Mostly one connected network.",
  Medium: "A few disconnected pockets.",
  High: "Many pockets—trailhead choice changes the hike.",
};

export type TrailStyleResult = {
  title: string;
  subtitle: string;
  description: string;
};

/**
 * Classify walking experience from graph metrics. First matching rule wins.
 */
function getTrailStyle(
  deadEndRatio: number,
  intersectionsPer100Nodes: number,
  componentCount: number,
  loopPotentialLabel: "Low" | "Medium" | "High"
): TrailStyleResult {
  // 1) Branching Exploration Network
  if (deadEndRatio >= 0.5 && intersectionsPer100Nodes >= 3) {
    return {
      title: "Branching exploration network",
      subtitle: "Lots of side paths and sniffing routes",
      description:
        "Expect many short spurs and detours rather than a single defined route. Dogs usually enjoy this type of trail because there are constant new smells and direction changes. You may naturally wander and double back.",
    };
  }
  // 2) Loop Park Trail
  if (loopPotentialLabel === "High" && componentCount <= 2) {
    return {
      title: "Loop-style trail",
      subtitle: "Continuous walking route",
      description:
        "Paths connect into clean loops. Good for steady exercise walks without backtracking.",
    };
  }
  // 3) Linear Out-and-Back
  if (intersectionsPer100Nodes < 3 && deadEndRatio < 0.4) {
    return {
      title: "Linear out-and-back trail",
      subtitle: "Simple navigation",
      description:
        "Mostly one main path. Easy to follow and predictable distance.",
    };
  }
  // 4) Fragmented Pocket Trails
  if (componentCount >= 8) {
    return {
      title: "Pocket trail system",
      subtitle: "Trailhead choice changes the walk",
      description:
        "This area is split into separate sections. Where you start determines what you can access.",
    };
  }
  // DEFAULT
  return {
    title: "Mixed network trail",
    subtitle: "Varied layout",
    description:
      "Contains a mix of connectors and short branches.",
  };
}

export type LoopStats = {
  hasLoop?: boolean;
  loopCountEstimate?: number;
  largestLoopMiles?: number | null;
};

export type RouteNetworkSectionProps = {
  routeGraphStats?: RouteGraphStats | null;
  loopStats?: LoopStats | null;
  /** When true, show QA line (deadEndRatio, edgesPerNode, etc.). Typically from searchParams.debug === "1". */
  showDebugQA?: boolean;
};

export function RouteNetworkSection({
  routeGraphStats,
  loopStats: loopStatsProp,
  showDebugQA = false,
}: RouteNetworkSectionProps) {
  const stats = routeGraphStats && typeof routeGraphStats === "object" ? routeGraphStats : null;
  const nodeCount = asNum(stats?.nodeCount);
  const edgeCount = asNum(stats?.edgeCount);

  if (nodeCount == null || edgeCount == null) return null;

  const deadEndCount = asNum(stats?.deadEndCount) ?? 0;
  const componentCount = asNum(stats?.componentCount) ?? 0;
  const intersectionCount = asNum(stats?.intersectionCount) ?? 0;

  const nodes = Math.max(1, nodeCount);
  const deadEndRatio = deadEndCount / nodes;
  const edgesPerNode = (2 * edgeCount) / nodes;
  const intersectionsPer100Nodes = (intersectionCount / nodes) * 100;

  const lostRisk = gettingLostRisk(intersectionsPer100Nodes);
  const { label: loopLabel, score: loopPotentialScore } = loopPotential(
    edgesPerNode,
    intersectionsPer100Nodes,
    deadEndRatio,
    componentCount
  );
  const startMatters = chooseStartMatters(componentCount);
  const trailStyle = getTrailStyle(
    deadEndRatio,
    intersectionsPer100Nodes,
    componentCount,
    loopLabel
  );

  // Summary paragraph: sentence 1 = navigation (gettingLostRisk), sentence 2 = loopPotential, sentence 3 = disconnected if componentCount > 1
  const navSentence =
    lostRisk === "Low"
      ? "Navigation is mostly straightforward with few decision points."
      : lostRisk === "Medium"
        ? "Navigation has some junctions to watch."
        : "Navigation is complex with many junctions—watch your turns.";
  const loopSentence =
    loopLabel === "Low"
      ? "Expect lots of spurs and backtracking, with limited loop options."
      : loopLabel === "Medium"
        ? "You’ll find some loop options among out-and-back segments."
        : "There are many ways to link path segments into loops.";
  const pocketsSentence =
    componentCount > 1
      ? `This area has ${componentCount} separate pocket${componentCount === 1 ? "" : "s"}, so picking the right trailhead helps.`
      : null;

  const sectionStyle = {
    marginTop: "1.25rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    padding: "0.9rem",
  } as const;
  const chipWrapStyle = {
    minWidth: "10rem",
    maxWidth: "14rem",
    flex: "1 1 auto",
  } as const;
  const chipStyle = {
    display: "block",
    padding: "0.4rem 0.65rem",
    borderRadius: "0.5rem",
    fontSize: "0.85rem",
    fontWeight: 600,
    background: "#f1f5f9",
    color: "#374151",
  } as const;
  const captionStyle = {
    marginTop: "0.25rem",
    fontSize: "0.8rem",
    color: "#6b7280",
    lineHeight: 1.3,
  } as const;

  return (
    <section style={sectionStyle}>
      <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "#111827" }}>
        Route network
      </h2>

      <div style={{ marginTop: "0.75rem" }}>
        <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.03em" }}>
          Trail style
        </p>
        <p style={{ margin: "0.35rem 0 0", fontSize: "1.1rem", fontWeight: 700, color: "#111827" }}>
          {trailStyle.title}
        </p>
        <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "#6b7280" }}>
          {trailStyle.subtitle}
        </p>
        <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem", lineHeight: 1.5, color: "#374151" }}>
          {trailStyle.description}
        </p>
      </div>

      {loopStatsProp != null && typeof loopStatsProp === "object" && typeof loopStatsProp.hasLoop === "boolean" && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.6rem 0.75rem",
            background: "#f8fafc",
            borderLeft: "3px solid #94a3b8",
            borderRadius: "0 0.375rem 0.375rem 0",
            fontSize: "0.9rem",
            lineHeight: 1.45,
            color: "#374151",
          }}
        >
          {loopStatsProp.hasLoop ? (
            <>
              <p style={{ margin: 0, fontWeight: 600, color: "#334155", fontSize: "0.9rem" }}>
                🔁 Loop routes available
              </p>
              <p style={{ margin: "0.35rem 0 0" }}>
                {(loopStatsProp.loopCountEstimate != null && Number(loopStatsProp.loopCountEstimate) > 1)
                  ? `Approximately ${Number(loopStatsProp.loopCountEstimate)} different loop routes exist.`
                  : "A continuous loop route is present."}
                {" "}
                {loopStatsProp.largestLoopMiles != null && Number.isFinite(Number(loopStatsProp.largestLoopMiles))
                  ? `Largest estimated loop: ${Number(loopStatsProp.largestLoopMiles).toFixed(1)} miles.`
                  : "These appear to be shorter circuit-style loops rather than long-distance loops."}
              </p>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontWeight: 600, color: "#334155", fontSize: "0.9rem" }}>
                ↩️ No continuous loop routes
              </p>
              <p style={{ margin: "0.35rem 0 0" }}>
                This trail network is made of branches and spurs rather than full circles. Expect to retrace parts of your path when returning.
              </p>
            </>
          )}
        </div>
      )}

      <hr style={{ marginTop: "1rem", marginBottom: 0, border: 0, borderTop: "1px solid #e5e7eb" }} />

      <div
        style={{
          marginTop: "0.75rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem 1.25rem",
        }}
      >
        <div style={chipWrapStyle}>
          <span style={chipStyle}>Getting lost risk: {lostRisk}</span>
          <p style={captionStyle}>{GETTING_LOST_CAPTIONS[lostRisk]}</p>
        </div>
        <div style={chipWrapStyle}>
          <span style={chipStyle}>Loop potential: {loopLabel}</span>
          <p style={captionStyle}>{LOOP_POTENTIAL_CAPTIONS[loopLabel]}</p>
        </div>
        <div style={chipWrapStyle}>
          <span style={chipStyle}>Choose-your-start matters: {startMatters}</span>
          <p style={captionStyle}>{CHOOSE_START_CAPTIONS[startMatters]}</p>
        </div>
      </div>

      <p
        style={{
          marginTop: "0.75rem",
          marginBottom: 0,
          fontSize: "0.9rem",
          lineHeight: 1.5,
          color: "#374151",
        }}
      >
        {navSentence} {loopSentence}
        {pocketsSentence ? ` ${pocketsSentence}` : ""}
      </p>

      {componentCount >= 3 && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.65rem 0.75rem",
            background: "#f0f9ff",
            borderLeft: "3px solid #0ea5e9",
            borderRadius: "0 0.375rem 0.375rem 0",
            fontSize: "0.9rem",
            lineHeight: 1.45,
            color: "#374151",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: "#0c4a6e", fontSize: "0.9rem" }}>
            Where you start matters here
          </p>
          <p style={{ margin: "0.35rem 0 0" }}>
            {componentCount >= 8
              ? "This trail system is split into many separate pockets. Starting at different entrances gives you access to completely different areas."
              : "This trail has multiple disconnected sections. Some entrances reach longer routes than others."}
            {" "}
            We analyzed the entrances and suggested starting points below.
          </p>
        </div>
      )}

      <details style={{ marginTop: "0.75rem" }}>
        <summary style={{ cursor: "pointer", fontSize: "0.85rem", fontWeight: 600, color: "#6b7280" }}>
          How we estimate this
        </summary>
        <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#374151" }}>
          <p style={{ margin: "0 0 0.35rem", fontWeight: 600 }}>Definitions</p>
          <dl style={{ margin: 0, paddingLeft: "1rem" }}>
            <dt style={{ fontWeight: 500 }}>Decision points</dt>
            <dd style={{ marginLeft: "1rem", marginTop: "0.1rem" }}>= {intersectionCount} (intersection count)</dd>
            <dt style={{ fontWeight: 500, marginTop: "0.25rem" }}>Spurs</dt>
            <dd style={{ marginLeft: "1rem", marginTop: "0.1rem" }}>= {deadEndCount} (dead ends)</dd>
            <dt style={{ fontWeight: 500, marginTop: "0.25rem" }}>Disconnected pockets</dt>
            <dd style={{ marginLeft: "1rem", marginTop: "0.1rem" }}>= {componentCount} (separate sub-networks)</dd>
          </dl>
          <p style={{ margin: "0.75rem 0 0.35rem", fontWeight: 600 }}>Raw stats</p>
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            <li>Nodes: {nodeCount}</li>
            <li>Edges: {edgeCount}</li>
            <li>Intersections: {intersectionCount}</li>
            <li>Dead ends: {deadEndCount}</li>
            <li>Components: {componentCount}</li>
          </ul>
          <p style={{ margin: "0.75rem 0 0.35rem", fontWeight: 600 }}>Derived</p>
          <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            <li>deadEndRatio: {deadEndRatio.toFixed(4)}</li>
            <li>edgesPerNode: {edgesPerNode.toFixed(4)}</li>
            <li>intersectionsPer100Nodes: {intersectionsPer100Nodes.toFixed(2)}</li>
          </ul>
        </div>
      </details>

      {showDebugQA && (
        <p style={{ marginTop: "0.5rem", fontSize: "0.7rem", color: "#9ca3af" }}>
          QA: deadEndRatio={deadEndRatio.toFixed(4)}, edgesPerNode={edgesPerNode.toFixed(4)},
          intersectionsPer100Nodes={intersectionsPer100Nodes.toFixed(2)}, loopPotentialScore=
          {loopPotentialScore}
        </p>
      )}
    </section>
  );
}
