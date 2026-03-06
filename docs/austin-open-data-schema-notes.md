# Austin Open Data – schema and mapping notes

## Ingest rule: Existing only

**We only ingest segments where `phase_simple == "Existing"` AND `build_status == "Existing"`.**

Trail systems are derived by grouping segments by `urban_trail_system_name` **after** applying this filter. A system is included only if it has at least one segment that meets the Existing criteria.

---

## trailSystems – field mapping (Austin jdwm-wfps)

| InstantDB field       | Source field / notes                                      |
|-----------------------|-----------------------------------------------------------|
| source                | `"austin_open_data"` (literal)                            |
| name                  | urban_trail_system_name                                   |
| slug                  | derived from name                                         |
| city                  | optional                                                  |
| county                | optional                                                  |
| managingAgencyName    | managing_agency_name (optional)                           |
| agencyType            | agency_type (optional)                                    |
| yearOpen              | year_open (optional, number)                              |
| totalLengthMiles      | optional, aggregated from segments                        |
| surfaces              | optional, JSON (e.g. list of surface types)               |
| types                 | optional, JSON (e.g. list of trail types)                 |
| geometryBbox          | optional, JSON                                            |
| centroid              | optional, JSON                                            |
| lastModifiedAt        | optional, string                                         |
| existingOnly          | always `true` for this dataset (invariant)                 |

---

## Excluded fields (intentional)

The following Austin Open Data fields are **not** stored on trailSystems (or used for ingest logic beyond the Existing filter):

- **project_sponsor** – not stored
- **priority_2023utp** – not stored

We also do **not** store `phase_simple`, `build_status`, `status`, `projectSponsor`, or `priority` on the trailSystems entity; they are used only to filter which segments/systems are ingested (Existing-only).

---

## trailSegments

Schema is unchanged. Segments are ingested only when their record has `phase_simple == "Existing"` and `build_status == "Existing"`.
