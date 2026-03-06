# Dog Hiking Trails --- Master Data & Enrichment Plan

## Purpose

This document defines the core enrichment layers for a dog-focused
hiking trail directory.

Each parameter includes: - Definition - How it is computed - Data
sources - How it is spatially mapped to a trail - Difficulty level

Base Trail Entity (from Hiking Project): - Name - Geometry
(LineString) - Distance - Elevation gain - Start / End coordinates

------------------------------------------------------------------------

# 1. Dogs Allowed (General Policy)

## Definition

Whether dogs are allowed on the trail at all.

## Computation

-   Determine governing park/area via spatial containment.
-   Extract pet policy from official park authority source.
-   Normalize to: allowed \| prohibited \| unknown.

## Data Sources

-   Park authority websites (primary)
-   Municipal code databases
-   OSM tags (supporting only)

## Spatial Mapping

-   Trail geometry intersected with park boundary polygon.
-   Park policy propagated down to trail.

## Difficulty

Medium

------------------------------------------------------------------------

# 2. Leash Policy

## Definition

Whether dogs must be leashed or may be off-leash.

## Computation

-   Extract leash rule from park policy.
-   Normalize to: required \| off_leash_allowed \| conditional \|
    unknown.

## Data Sources

-   Park authority website
-   Municipal open data (off-leash zones)
-   OSM leash tags (supporting)

## Spatial Mapping

-   Park-level rule applied to trail.
-   Optional: intersect trail with off-leash polygon zones.

## Difficulty

Low--Medium

------------------------------------------------------------------------

# 3. Crowd Level (Reactive Dog Risk)

## Definition

Estimated crowd intensity based on infrastructure and social signals.

## Computation

-   Estimate parking capacity near trailhead.
-   Optionally incorporate review count signal.
-   Classify: low \| medium \| high.

## Data Sources

-   OSM parking polygons
-   Municipal parking GIS
-   Hiking Project review count
-   Google Places (optional)

## Spatial Mapping

-   Identify trailhead.
-   Query parking within 300m.
-   Compute area or capacity tags.

## Difficulty

Easy--Medium

------------------------------------------------------------------------

# 4. Wildlife Risk

## Definition

Presence of wildlife or hunting zones that may pose risk to dogs.

## Computation

-   Overlay trail geometry with wildlife habitat polygons.
-   Flag intersecting species risk.

## Data Sources

-   State wildlife GIS datasets
-   USGS habitat layers
-   Hunting unit polygons

## Spatial Mapping

-   Spatial intersection between trail geometry and wildlife polygons.

## Difficulty

Medium

------------------------------------------------------------------------

# 5. Swim Access (Physical & Legal)

## Definition

Whether the trail provides water access suitable for dog swimming.

## Computation

Physical: - Buffer trail by 30--50m. - Check intersection with water
polygons/lines. - Apply size thresholds for usability.

Legal: - Extract swimming policy from park authority.

## Data Sources

-   OSM (natural=water, waterway=\*)
-   USGS Hydrography (NHD)
-   Park websites

## Spatial Mapping

-   Geometry buffer intersection with water features.
-   Park-level policy attachment.

## Difficulty

Physical: Easy--Medium Legal: Medium

------------------------------------------------------------------------

# 6. Shade Percentage

## Definition

Percentage of trail under tree canopy.

## Computation

-   Sample points along trail at fixed interval.
-   Overlay with land cover raster.
-   Compute % of forest canopy coverage.

## Data Sources

-   USGS NLCD
-   State tree canopy datasets
-   OSM forest polygons (fallback)

## Spatial Mapping

-   Point sampling along LineString.
-   Raster lookup per sample point.

## Difficulty

Medium

------------------------------------------------------------------------

# 7. Surface & Paw Safety

## Definition

Surface composition and paw safety risk.

## Computation

-   Intersect trail geometry with OSM ways.
-   Extract surface tags.
-   Compute length-weighted distribution.
-   Flag asphalt % for heat risk.

## Data Sources

-   OSM surface=\* tags
-   Hiking Project (secondary text)

## Spatial Mapping

-   Geometry intersection between HP trail and OSM ways.

## Difficulty

Medium

------------------------------------------------------------------------

# 8. Dog-Adjusted Difficulty

## Definition

Suitability based on elevation and terrain for different dog types.

## Computation

-   Elevation gain per mile.
-   Surface roughness factor.
-   Optional slope sampling from DEM.
-   Classify for: small \| senior \| high-energy dogs.

## Data Sources

-   Hiking Project elevation
-   USGS DEM (optional)
-   OSM technical tags (sac_scale)

## Spatial Mapping

-   Derived metric from trail attributes.
-   Optional DEM sampling along geometry.

## Difficulty

Easy--Medium

------------------------------------------------------------------------

# 9. Dog Time Estimate

## Definition

Realistic time range for completing trail with a dog.

## Computation

-   Base speed adjusted from distance.
-   Elevation modifier.
-   Surface and heat modifiers.
-   Add 10--20% buffer for dog pacing.

## Data Sources

-   Derived from existing trail metrics.

## Spatial Mapping

-   Purely computed from trail attributes.

## Difficulty

Easy

------------------------------------------------------------------------

# 10. Dog Fit Profile

## Definition

Categorization of trail suitability by dog type.

## Computation

-   Combine distance, elevation, shade, surface, wildlife.
-   Produce suitability flags per dog type.

## Data Sources

-   All previously derived attributes.

## Spatial Mapping

-   Derived classification.

## Difficulty

Easy

------------------------------------------------------------------------

# 11. Seasonal Suitability

## Definition

Best and caution months for hiking with dogs.

## Computation

-   Attach monthly climate normals via trail centroid.
-   Identify high-heat months.
-   Overlay seasonal park rules if present.

## Data Sources

-   NOAA climate normals
-   PRISM datasets
-   Park authority websites

## Spatial Mapping

-   Trail centroid → climate grid cell.
-   Park containment for seasonal rules.

## Difficulty

Easy--Medium

------------------------------------------------------------------------

# 12. Mud Risk (After Rain)

## Definition

Likelihood of muddy conditions after rainfall.

## Computation

-   Evaluate dirt/gravel surface ratio.
-   Overlay with soil drainage polygons.
-   Classify mud susceptibility.
-   Optional rainfall multiplier.

## Data Sources

-   OSM surface tags
-   USDA SSURGO soil datasets
-   NOAA rainfall data (optional)

## Spatial Mapping

-   Geometry intersection with soil polygons.
-   Surface distribution analysis.

## Difficulty

Surface-only: Easy Surface + Soil: Medium Dynamic rainfall: Medium

------------------------------------------------------------------------

# System Architecture Principle

All enrichment layers connect to the trail via:

1.  Spatial containment (trail inside park polygon)
2.  Geometry intersection
3.  Buffer proximity
4.  Centroid lookup
5.  Derived metrics from trail attributes

There are no shared IDs across datasets. Spatial logic is the universal
connector.

------------------------------------------------------------------------

# MVP Recommendation

For initial validation phase, prioritize:

1.  Dogs Allowed + Leash Policy
2.  Swim Access
3.  Shade Percentage
4.  Surface & Paw Safety
5.  Dog Time Estimate

These provide strong dog-specific differentiation with manageable
implementation complexity.
