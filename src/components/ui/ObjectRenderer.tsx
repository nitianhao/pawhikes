/**
 * Renders arbitrary data as human-readable UI. No JSON.stringify, no <pre>.
 * Long arrays and object key lists show first 5 items, then "Show more" to expand.
 */

"use client";

import { useState } from "react";
import { humanizeKey } from "@/lib/trailSystems/formatters";

const MAX_VISIBLE = 5;

const URL_RE = /^https?:\/\/[^\s]+$/i;

const POI_KEY_ORDER = [
  "kind",
  "name",
  "anchor",
  "osmType",
  "osmId",
  "distanceToAnchorMeters",
  "distanceToTrailMeters",
  "distanceToWaterMeters",
  "location",
  "tags",
];

function isUrl(s: string): boolean {
  return URL_RE.test(String(s).trim());
}

function formatKey(key: string): string {
  return humanizeKey(key) || key;
}

function isPrimitive(val: unknown): boolean {
  return (
    val == null ||
    typeof val === "string" ||
    typeof val === "number" ||
    typeof val === "boolean"
  );
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val != null && typeof val === "object" && !Array.isArray(val);
}

function ExpandableTagsGrid({ entries }: { entries: [string, unknown][] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? entries : entries.slice(0, MAX_VISIBLE);
  const rest = entries.length - MAX_VISIBLE;
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "0.125rem 0.75rem",
          fontSize: "0.8125rem",
        }}
      >
        {visible.map(([k, v]) => (
          <span key={k} style={{ display: "contents" }}>
            <span style={{ color: "#6b7280" }}>{formatKey(k)}:</span>
            <span>{formatPrimitive(v)}</span>
          </span>
        ))}
      </div>
      {!expanded && rest > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            marginTop: "0.25rem",
            padding: "0.2rem 0.5rem",
            fontSize: "0.75rem",
            color: "#2563eb",
            background: "none",
            border: "1px solid #93c5fd",
            borderRadius: "0.375rem",
            cursor: "pointer",
          }}
        >
          Show more ({rest} more)
        </button>
      )}
    </div>
  );
}

function formatPrimitive(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  return String(value);
}

function sortKeysForPoi(obj: Record<string, unknown>): string[] {
  const keys = Object.keys(obj);
  const ordered: string[] = [];
  for (const k of POI_KEY_ORDER) {
    if (keys.includes(k)) ordered.push(k);
  }
  const rest = keys.filter((k) => !POI_KEY_ORDER.includes(k)).sort((a, b) => a.localeCompare(b));
  return [...ordered, ...rest];
}

function formatLocation(loc: unknown): string {
  if (loc == null) return "—";
  if (typeof loc === "object" && !Array.isArray(loc)) {
    const o = loc as Record<string, unknown>;
    const geom = o.geometry && typeof o.geometry === "object" ? (o.geometry as Record<string, unknown>) : null;
    const type = (o.type ?? geom?.type ?? "") as string;
    const coords = o.coordinates ?? geom?.coordinates ?? null;
    if (Array.isArray(coords)) {
      const flat = (coords as unknown[]).flat(2);
      return `${String(type) || "Point"}: [${flat.map((c) => Number(c)).join(", ")}]`;
    }
  }
  return String(loc);
}

type ObjectRendererProps = {
  title?: string;
  data: unknown;
  maxDepth?: number;
  excludeKeys?: string[];
  depth?: number;
  renderMode?: "default" | "poi";
};

function RenderValue({
  data,
  maxDepth,
  excludeKeys,
  depth,
  renderMode,
  isTags,
  isLocation,
}: {
  data: unknown;
  maxDepth: number;
  excludeKeys: string[];
  depth: number;
  renderMode: "default" | "poi";
  isTags?: boolean;
  isLocation?: boolean;
}) {
  if (isTags && isPlainObject(data)) {
    const entries = Object.entries(data as Record<string, unknown>) as [string, unknown][];
    if (entries.length === 0) return <span style={{ color: "#6b7280" }}>—</span>;
    return <ExpandableTagsGrid entries={entries} />;
  }
  if (isLocation && isPlainObject(data)) {
    const o = data as Record<string, unknown>;
    const coords = o.coordinates ?? (o.geometry && typeof o.geometry === "object" ? (o.geometry as Record<string, unknown>).coordinates : null);
    const summary = Array.isArray(coords) ? formatLocation(data) : null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {summary != null && <span>{summary}</span>}
        <ObjectRenderer
          data={data}
          maxDepth={maxDepth}
          excludeKeys={excludeKeys}
          depth={depth}
          renderMode={renderMode}
        />
      </div>
    );
  }
  return (
    <ObjectRenderer
      data={data}
      maxDepth={maxDepth}
      excludeKeys={excludeKeys}
      depth={depth}
      renderMode={renderMode}
    />
  );
}

export function ObjectRenderer({
  title,
  data,
  maxDepth = 4,
  excludeKeys = [],
  depth = 0,
  renderMode = "default",
}: ObjectRendererProps) {
  const exc = new Set(excludeKeys.map((k) => String(k).toLowerCase()));
  const [arrayExpanded, setArrayExpanded] = useState(false);
  const [objectExpanded, setObjectExpanded] = useState(false);

  if (data == null) {
    return <span style={{ color: "#6b7280" }}>—</span>;
  }

  if (depth >= maxDepth) {
    return (
      <span style={{ color: "#6b7280", fontStyle: "italic" }}>(…truncated)</span>
    );
  }

  if (typeof data === "string") {
    const s = data.trim();
    if (!s) return <span style={{ color: "#6b7280" }}>—</span>;
    if (isUrl(s)) {
      return (
        <a
          href={s}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2563eb", textDecoration: "underline" }}
        >
          {s}
        </a>
      );
    }
    return <span>{s}</span>;
  }

  if (typeof data === "number") {
    return (
      <span>{Number.isFinite(data) ? String(data) : "—"}</span>
    );
  }

  if (typeof data === "boolean") {
    return <span>{data ? "Yes" : "No"}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span style={{ color: "#6b7280" }}>—</span>;
    }
    const allPrimitive = data.every((v) => isPrimitive(v));
    if (allPrimitive) {
      const visible = arrayExpanded ? data : data.slice(0, MAX_VISIBLE);
      const rest = data.length - MAX_VISIBLE;
      return (
        <div>
          <ul
            style={{
              margin: 0,
              paddingLeft: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.25rem",
            }}
          >
            {visible.map((v, i) => (
              <li key={i}>{formatPrimitive(v)}</li>
            ))}
          </ul>
          {!arrayExpanded && rest > 0 && (
            <button
              type="button"
              onClick={() => setArrayExpanded(true)}
              style={{
                marginTop: "0.35rem",
                padding: "0.2rem 0.5rem",
                fontSize: "0.8rem",
                color: "#2563eb",
                background: "none",
                border: "1px solid #93c5fd",
                borderRadius: "0.375rem",
                cursor: "pointer",
              }}
            >
              Show more ({rest} more)
            </button>
          )}
        </div>
      );
    }

    // Array of objects: show first 5, then "Show more"
    const usePoiMode = renderMode === "poi";
    const items = data as unknown[];
    const visibleItems = arrayExpanded ? items : items.slice(0, MAX_VISIBLE);
    const restCount = items.length - MAX_VISIBLE;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          position: "relative",
        }}
      >
        {visibleItems.map((item, i) => {
          if (!isPlainObject(item)) {
            return (
              <div
                key={i}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.5rem",
                  padding: "0.75rem",
                  backgroundColor: "#f9fafb",
                }}
              >
                <ObjectRenderer
                  data={item}
                  maxDepth={maxDepth}
                  excludeKeys={excludeKeys}
                  depth={depth + 1}
                  renderMode={renderMode}
                />
              </div>
            );
          }
          const obj = item as Record<string, unknown>;
          const keys = usePoiMode ? sortKeysForPoi(obj) : Object.keys(obj).sort((a, b) => a.localeCompare(b));
          const filteredKeys = keys.filter((k) => !exc.has(k.toLowerCase()));
          if (filteredKeys.length === 0) {
            return (
              <div
                key={i}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.5rem",
                  padding: "0.75rem",
                  backgroundColor: "#f9fafb",
                }}
              >
                <span style={{ color: "#6b7280" }}>—</span>
              </div>
            );
          }

          const kind = obj.kind ?? obj.type ?? "";
          const anchor = obj.anchor ?? "";
          const distAnchor = obj.distanceToAnchorMeters;
          const distTrail = obj.distanceToTrailMeters;
          const distWater = obj.distanceToWaterMeters;
          const dist =
            typeof distAnchor === "number" && Number.isFinite(distAnchor)
              ? `${Number(distAnchor).toFixed(1)} m`
              : typeof distTrail === "number" && Number.isFinite(distTrail)
                ? `${Number(distTrail).toFixed(1)} m`
                : typeof distWater === "number" && Number.isFinite(distWater)
                  ? `${Number(distWater).toFixed(1)} m`
                  : "";
          const headerParts: string[] = [];
          if (kind != null && String(kind).trim()) headerParts.push(String(kind));
          else headerParts.push(`Item ${i + 1}`);
          if (anchor != null && String(anchor).trim()) headerParts.push(String(anchor));
          if (dist) headerParts.push(dist);
          const headerLine = headerParts.join(" • ");

          return (
            <div
              key={i}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "0.5rem",
                padding: "0.75rem",
                backgroundColor: "#f9fafb",
              }}
            >
              <div
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                {headerLine}
              </div>
              <dl
                style={{
                  margin: 0,
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "0.25rem 1rem",
                  alignItems: "baseline",
                  fontSize: "0.8125rem",
                }}
              >
                {filteredKeys.map((key) => {
                  const value = obj[key];
                  const isTags = key === "tags";
                  const isLocation = key === "location";
                  return (
                    <span key={key} style={{ display: "contents" }}>
                      <dt
                        style={{
                          color: "#6b7280",
                          fontWeight: 500,
                          fontSize: "0.8125rem",
                        }}
                      >
                        {formatKey(key)}:
                      </dt>
                      <dd style={{ margin: 0 }}>
                        <RenderValue
                          data={value}
                          maxDepth={maxDepth}
                          excludeKeys={excludeKeys}
                          depth={depth + 1}
                          renderMode={renderMode}
                          isTags={isTags}
                          isLocation={isLocation}
                        />
                      </dd>
                    </span>
                  );
                })}
              </dl>
            </div>
          );
        })}
        {!arrayExpanded && restCount > 0 && (
          <button
            type="button"
            onClick={() => setArrayExpanded(true)}
            style={{
              padding: "0.25rem 0.5rem",
              fontSize: "0.8rem",
              color: "#2563eb",
              background: "none",
              border: "1px solid #93c5fd",
              borderRadius: "0.375rem",
              cursor: "pointer",
              alignSelf: "flex-start",
            }}
          >
            Show more ({restCount} more)
          </button>
        )}
      </div>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>).filter(
      ([k]) => !exc.has(k.toLowerCase())
    );
    if (entries.length === 0) {
      return <span style={{ color: "#6b7280" }}>—</span>;
    }
    const keys = renderMode === "poi"
      ? sortKeysForPoi(data as Record<string, unknown>).filter((k) => !exc.has(k.toLowerCase()))
      : entries.map(([k]) => k);
    const visibleKeys = objectExpanded ? keys : keys.slice(0, MAX_VISIBLE);
    const restKeysCount = keys.length - MAX_VISIBLE;
    return (
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "0.5rem",
          padding: "0.75rem",
          backgroundColor: "rgba(249, 250, 251, 0.8)",
        }}
      >
        {title != null && title.trim() && (
          <div
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#374151",
              marginBottom: "0.5rem",
            }}
          >
            {title}
          </div>
        )}
        <dl
          style={{
            margin: 0,
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "0.25rem 1rem",
            alignItems: "baseline",
            fontSize: "0.875rem",
          }}
        >
          {visibleKeys.map((key) => {
            const value = (data as Record<string, unknown>)[key];
            const isTags = key === "tags";
            const isLocation = key === "location";
            return (
              <span key={key} style={{ display: "contents" }}>
                <dt
                  style={{
                    color: "#6b7280",
                    fontWeight: 500,
                  }}
                >
                  {formatKey(key)}:
                </dt>
                <dd style={{ margin: 0 }}>
                  <RenderValue
                    data={value}
                    maxDepth={maxDepth}
                    excludeKeys={excludeKeys}
                    depth={depth + 1}
                    renderMode={renderMode}
                    isTags={isTags}
                    isLocation={isLocation}
                  />
                </dd>
              </span>
            );
          })}
        </dl>
        {!objectExpanded && restKeysCount > 0 && (
          <button
            type="button"
            onClick={() => setObjectExpanded(true)}
            style={{
              marginTop: "0.35rem",
              padding: "0.2rem 0.5rem",
              fontSize: "0.8rem",
              color: "#2563eb",
              background: "none",
              border: "1px solid #93c5fd",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Show more ({restKeysCount} more)
          </button>
        )}
      </div>
    );
  }

  return <span>{String(data)}</span>;
}
