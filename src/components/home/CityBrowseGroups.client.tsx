"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";

export type CityBrowseItem = {
  key: string;
  cityLabel: string;
  stateLabel: string;
  cityHref: string;
  trailCount: number;
};

export type CityBrowseGroup = {
  stateCode: string;
  stateLabel: string;
  cities: CityBrowseItem[];
};

export function CityBrowseGroups({ groups }: { groups: CityBrowseGroup[] }) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const liveId = useId();
  const normalizedQuery = query.trim().toLowerCase();
  const isFiltering = normalizedQuery.length > 0;
  const showStateHeadings = groups.length > 1;

  const filteredGroups = useMemo(() => {
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => ({
        ...group,
        cities: group.cities.filter((city) => {
          const haystack = `${city.cityLabel} ${city.stateLabel}`.toLowerCase();
          return haystack.includes(normalizedQuery);
        }),
      }))
      .filter((group) => group.cities.length > 0);
  }, [groups, normalizedQuery]);

  const matchCount = filteredGroups.reduce((sum, group) => sum + group.cities.length, 0);
  const matchedStateCount = filteredGroups.length;
  const matchedTrailCount = filteredGroups.reduce(
    (sum, group) => sum + group.cities.reduce((citySum, city) => citySum + city.trailCount, 0),
    0
  );
  const hasMatches = matchCount > 0;
  const showStateJumps = filteredGroups.length > 1;
  const featuredCityKey =
    !isFiltering && filteredGroups.length > 0 && filteredGroups[0].cities.length > 0
      ? filteredGroups[0].cities[0].key
      : null;

  return (
    <div>
      <div className="home-city-filter-wrap">
        <label htmlFor={listId} className="home-city-filter-label">Filter cities</label>
        <div className="home-city-filter-row">
          <input
            id={listId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query.trim()) {
                setQuery("");
              }
            }}
            className="home-city-filter-input"
            placeholder="Search by city or state"
            aria-describedby={liveId}
            aria-controls={`${listId}-results`}
            autoComplete="off"
            enterKeyHint="search"
          />
          {query.trim() && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="home-city-filter-clear"
              aria-label="Clear city filter"
            >
              Clear
            </button>
          )}
        </div>
        {normalizedQuery && (
          <p id={liveId} aria-live="polite" aria-atomic="true" className="home-city-filter-status">
            Showing {matchCount} {matchCount === 1 ? "city" : "cities"} in {matchedStateCount} {matchedStateCount === 1 ? "state" : "states"}.
          </p>
        )}
      </div>

      <div className="home-city-coverage-summary" aria-live="polite" aria-atomic="true">
        <span className="home-city-coverage-stat">
          <strong>{matchCount}</strong> {matchCount === 1 ? "city" : "cities"}
        </span>
        <span className="home-city-coverage-stat">
          <strong>{matchedStateCount}</strong> {matchedStateCount === 1 ? "state" : "states"}
        </span>
        <span className="home-city-coverage-stat">
          <strong>{matchedTrailCount}</strong> {matchedTrailCount === 1 ? "trail" : "trails"}
        </span>
      </div>

      {showStateJumps && (
        <nav className="home-city-state-jumps" aria-label="Jump to state">
          {filteredGroups.map((group) => {
            const sectionId = `home-coverage-group-${group.stateCode}`;
            return (
              <a key={group.stateCode} href={`#${sectionId}`} className="home-city-state-jump-link">
                {group.stateLabel}
              </a>
            );
          })}
        </nav>
      )}

      {hasMatches ? (
        <div className="home-city-state-groups" id={`${listId}-results`}>
          {filteredGroups.map((group) => (
            <section
              key={group.stateCode}
              id={`home-coverage-group-${group.stateCode}`}
              className="home-city-state-group"
              aria-labelledby={showStateHeadings ? `home-coverage-state-${group.stateCode}` : undefined}
              aria-label={!showStateHeadings ? `${group.stateLabel} cities` : undefined}
            >
              {showStateHeadings && (
                <h3 id={`home-coverage-state-${group.stateCode}`} className="home-city-state-heading">
                  <span>{group.stateLabel}</span>
                  <span className="home-city-state-meta">
                    {group.cities.length} cit{group.cities.length === 1 ? "y" : "ies"}
                  </span>
                </h3>
              )}
              <div className="home-city-browse-grid" role="list">
                {group.cities.map((row) => (
                  <Link
                    key={row.key}
                    href={row.cityHref}
                    className={`home-city-browse-item${featuredCityKey === row.key ? " home-city-browse-item--featured" : ""}`}
                    role="listitem"
                    aria-label={`${row.cityLabel}, ${row.stateLabel} (${row.trailCount} trail${row.trailCount === 1 ? "" : "s"})`}
                  >
                    <div className="home-city-browse-main">
                      <h4 className="home-city-browse-city">{row.cityLabel}</h4>
                      {featuredCityKey === row.key && (
                        <span className="home-city-featured-badge">Top city</span>
                      )}
                      <p className="home-city-browse-state">{row.stateLabel}</p>
                    </div>
                    <span className="home-city-browse-count">
                      {row.trailCount} trail{row.trailCount === 1 ? "" : "s"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="home-city-filter-empty">
          No cities found for &quot;{query.trim()}&quot;. Try another city or state.
        </p>
      )}
    </div>
  );
}
