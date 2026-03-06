"use client";

import { useState } from "react";

type City = { id: string; name: string; state: string; slug: string };
type Trail = { id: string; name: string; slug: string; citySlug: string; lengthMiles?: number };
type Trailhead = { id: string; name: string; lat: number; lng: number; citySlug: string };

type Data = {
  cities: City[];
  trails: Trail[];
  trailheads: Trailhead[];
};

export default function DebugPage() {
  const [seedStatus, setSeedStatus] = useState<{
    status: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ status: "idle" });
  const [data, setData] = useState<Data | null>(null);
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleSeed = async () => {
    setSeedStatus({ status: "loading" });
    try {
      const res = await fetch("/api/debug/seed", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setSeedStatus({ status: "error", message: json.error ?? "Seed failed" });
        return;
      }
      setSeedStatus({ status: "success", message: json.message });
    } catch (e) {
      setSeedStatus({
        status: "error",
        message: e instanceof Error ? e.message : "Request failed",
      });
    }
  };

  const handleLoadData = async () => {
    setLoadStatus("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/debug/data");
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error ?? "Load failed");
        setLoadStatus("error");
        return;
      }
      setData(json);
      setLoadStatus("idle");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Request failed");
      setLoadStatus("error");
    }
  };

  const hasData =
    data &&
    (data.cities?.length > 0 || data.trails?.length > 0 || data.trailheads?.length > 0);

  return (
    <main style={{ padding: "2rem", maxWidth: "48rem" }}>
      <h1>Debug — InstantDB</h1>

      <section style={{ marginTop: "1.5rem" }}>
        <button
          type="button"
          onClick={handleSeed}
          disabled={seedStatus.status === "loading"}
          style={{
            padding: "0.5rem 1rem",
            marginRight: "0.5rem",
            cursor: seedStatus.status === "loading" ? "not-allowed" : "pointer",
          }}
        >
          {seedStatus.status === "loading" ? "Seeding…" : "Seed DB"}
        </button>
        <button
          type="button"
          onClick={handleLoadData}
          disabled={loadStatus === "loading"}
          style={{
            padding: "0.5rem 1rem",
            cursor: loadStatus === "loading" ? "not-allowed" : "pointer",
          }}
        >
          {loadStatus === "loading" ? "Loading…" : "Load Data"}
        </button>
        {seedStatus.status === "success" && (
          <span style={{ color: "green", marginLeft: "0.5rem" }}>{seedStatus.message}</span>
        )}
        {seedStatus.status === "error" && (
          <span style={{ color: "red", marginLeft: "0.5rem" }}>{seedStatus.message}</span>
        )}
        {loadStatus === "error" && loadError && (
          <span style={{ color: "red", marginLeft: "0.5rem" }}>{loadError}</span>
        )}
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Data</h2>
        {!data && loadStatus !== "loading" && (
          <p>No records yet — click Seed DB, then Load Data</p>
        )}
        {loadStatus === "loading" && <p>Loading…</p>}
        {data && !hasData && <p>No records yet — click Seed DB</p>}
        {data && hasData && (
          <>
            <h3>Cities</h3>
            <ul style={{ listStyle: "inside", marginBottom: "1rem" }}>
              {data.cities?.map((c) => (
                <li key={c.id}>
                  {c.name}, {c.state} (slug: {c.slug})
                </li>
              ))}
            </ul>
            <h3>Trails</h3>
            <ul style={{ listStyle: "inside", marginBottom: "1rem" }}>
              {data.trails?.map((t) => (
                <li key={t.id}>
                  {t.name} — {t.slug}, city: {t.citySlug}
                  {t.lengthMiles != null && `, ${t.lengthMiles} mi`}
                </li>
              ))}
            </ul>
            <h3>Trailheads</h3>
            <ul style={{ listStyle: "inside" }}>
              {data.trailheads?.map((th) => (
                <li key={th.id}>
                  {th.name} — {th.lat}, {th.lng} ({th.citySlug})
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
