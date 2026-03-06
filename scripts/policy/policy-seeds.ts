/**
 * Static policy seeds for trail systems.
 *
 * Keyed by systemSlug (preferred) or extSystemRef.
 * These are manually curated entries used by seed-policy-austin.ts.
 *
 * policyMethod is always "manual_seed" in this file.
 * Set policyConfidence low until an official source URL is confirmed.
 */

export type DogsAllowed = "allowed" | "prohibited" | "unknown";
export type LeashPolicy = "required" | "off_leash_allowed" | "conditional" | "unknown";
export type PolicyMethod = "manual_seed" | "scrape" | "muni_open_data" | "other";

export interface PolicySeed {
  dogsAllowed: DogsAllowed;
  leashPolicy: LeashPolicy;
  leashDetails?: string;
  policySourceUrl?: string;
  policySourceTitle?: string;
  policyConfidence: number; // 0..1
  policyMethod: PolicyMethod;
  policyNotes?: string;
}

/**
 * Slugs that should never be written to DB.
 * Add artifact / placeholder system slugs here.
 */
export const POLICY_SEED_SKIP_SLUGS: Set<string> = new Set([
  "not-assigned",
]);

/**
 * Primary lookup: keyed by systemSlug.
 * Add entries here as you verify official sources.
 */
export const POLICY_SEEDS: Record<string, PolicySeed> = {
  "brushy-creek-greenbelt-regional-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must not exceed 6 feet in length. No designated off-leash areas exist on the trail. Rule applies across all jurisdictions (Williamson County unincorporated segments, Cedar Park, and Round Rock city-limit segments).",
    policySourceUrl: "https://www.wilcotx.gov/606/Rules-Regulations",
    policySourceTitle: "Rules & Regulations | Williamson County, TX",
    policyConfidence: 0.88,
    policyMethod: "manual_seed",
    policyNotes: "Brushy Creek Regional Trail is a multi-jurisdictional trail managed primarily by Williamson County Parks & Recreation (unincorporated segments), with sections inside Cedar Park and Round Rock city limits. All three jurisdictions require leash at all times; no designated off-leash areas exist on the trail corridor. The 6-foot leash maximum is from the official Williamson County Parks Rules & Regulations (wilcotx.gov/606/Rules-Regulations), confirmed by county Parks FAQs (wilcotx.gov/1319/Parks-FAQs): 'pets must be on a leash and under control at all times.' Cedar Park's designated off-leash area is Cedar Bark Park at Veterans Memorial Park only (not on trail). Round Rock's off-leash area is Dog Depot Dog Park only (not on trail). Confidence 0.88: leash-required rule is explicit from the primary governing authority (Williamson County); 6-foot length limit is county-documented. Slight reduction from 1.0 because trail-specific rules PDF (wilcotx.gov/DocumentCenter/View/2449) was binary-encoded and not directly readable.",
  },
  "walnut-creek-corridor-southern-walnut-creek-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required (6 feet or shorter) on the trail corridor. Off-leash permitted only within the designated DOLA inside Walnut Creek Metropolitan Park — an unfenced area covering the northern portion of the park, bounded roughly by Cedar Bend Drive, the Walnut Creek waterway, and the park fence. Dogs must be leashed south of the creek. The DOLA designation does not extend to the trail corridor.",
    policySourceUrl: "https://www.austintexas.gov/department/dog-parks-leash-areas",
    policySourceTitle: "Dog Parks: Off-Leash Areas | AustinTexas.gov",
    policyConfidence: 0.82,
    policyMethod: "manual_seed",
    policyNotes: "Walnut Creek Metropolitan Park (12138 N Lamar Blvd) is an officially recognized unfenced Dog Off-Leash Area on the City of Austin Parks & Recreation DOLA list. The off-leash zone covers the northern portion of the park north of the Walnut Creek waterway, bounded by Cedar Bend Drive and the park fence. Standard DOLA rules apply: dogs must remain within sight and sound control, owner must carry a leash, rabies vaccination required, waste removal required, dogs in heat not permitted. The Walnut Creek Regional Trail / Southern Walnut Creek Trail corridor running through or adjacent to the park is part of the Austin Urban Trails network, where leash (6 feet or shorter) is required per the Urban Trails program rules — the DOLA does not extend to the trail tread. The trail also passes through sections outside the park where only the city-wide leash ordinance applies. Confidence 0.82 because the DOLA map PDF and park kiosk PDF (both city-hosted) were not directly human-readable; boundary details are corroborated by city ordinance language and GIS-hosted park materials.",
  },
  "ann-and-roy-butler-hike-and-bike-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times on the trail. Austin City Code requires dogs to be on a leash in public areas unless designated otherwise. No off-leash section on the trail itself; nearest off-leash areas are Auditorium Shores and Red Bud Isle.",
    policySourceUrl: "https://www.austintexas.gov/department/ann-and-roy-butler-hike-and-bike-trail-and-boardwalk-lady-bird-lake",
    policySourceTitle: "Ann and Roy Butler Hike-and-Bike Trail and Boardwalk at Lady Bird Lake | AustinTexas.gov",
    policyConfidence: 0.9,
    policyMethod: "manual_seed",
    policyNotes: "Official Austin PARD page and Trail Conservancy FAQ confirm dogs allowed, leash required. Blue-green algae health advisory for lake water contact in summer/fall. Off-leash areas (Auditorium Shores, Red Bud Isle) are separate designated locations.",
  },
  "boardwalk-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times. Austin City Code requires dogs on leash in all public areas unless designated otherwise. Boardwalk Trail is not a designated off-leash area.",
    policySourceUrl: "https://www.austintexas.gov/department/ann-and-roy-butler-hike-and-bike-trail-and-boardwalk-lady-bird-lake",
    policySourceTitle: "Ann and Roy Butler Hike-and-Bike Trail and Boardwalk at Lady Bird Lake | AustinTexas.gov",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "Boardwalk Trail is part of the Ann and Roy Butler trail system. No boardwalk-specific dog rules exist in official sources (austintexas.gov, thetrailconservancy.org). Same city-wide leash ordinance applies; 'pets on leash' ordinance is posted on trail signage throughout the system per Trail Conservancy FAQ.",
  },
  "mueller-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must be no more than 6 feet long. Mueller Lake Park is not a designated off-leash area (DOLA). No off-leash pilot program active at this location.",
    policySourceUrl: "https://www.austintexas.gov/department/leash-areas",
    policySourceTitle: "Dog Parks / Off-Leash Areas | City of Austin Parks and Recreation Department",
    policyConfidence: 0.9,
    policyMethod: "manual_seed",
    policyNotes: "Austin City Code requires dogs on leash in all public park areas unless designated otherwise. Mueller Lake Park does not appear on the official DOLA map (March 2023) or any PARD off-leash pilot list. A community advocacy group (Mueller Dog Park Coalition) has been seeking a pilot off-leash area in the Southeast Greenway, but none is currently designated. 6-foot leash limit from official PARD Park Rules.",
  },
  "violet-crown-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs must remain on-leash at all times between Mile Zero Trailhead (Zilker Park) and La Crosse Trailhead. No leash length specified by trail manager; Travis County segments apply a 6-foot maximum per county park rules.",
    policySourceUrl: "https://violetcrowntrail.com/plan-your-trip/",
    policySourceTitle: "Plan Your Trip | Violet Crown Trail (Hill Country Conservancy)",
    policyConfidence: 0.9,
    policyMethod: "manual_seed",
    policyNotes: "Hill Country Conservancy is the official managing partner; AustinTexas.gov explicitly names them and directs visitors to violetcrowntrail.com for trail rules. Official rule: 'Dogs are allowed on the Violet Crown Trail between the Mile Zero Trailhead and the La Crosse Trailhead, but must remain on-leash at all times.' Trail is not a DOLA and is not part of any PARD off-leash pilot program. Dog waste bags must be packed out entirely.",
  },
  "shoal-creek-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required (6 feet or shorter) on the trail corridor at all times per Austin Urban Trails program rules. Off-leash permitted only within the designated DOLA at Shoal Creek Greenbelt (2600 N. Lamar Blvd.), a specific park area adjacent to the trail — not the full trail corridor.",
    policySourceUrl: "https://www.austintexas.gov/urbantrails",
    policySourceTitle: "Urban Trails | City of Austin",
    policyConfidence: 0.9,
    policyMethod: "manual_seed",
    policyNotes: "Urban Trails program rule applies to the full Shoal Creek Trail corridor: 'Keep pets close to you and on leashes (leash must be 6 feet or shorter).' Separately, Shoal Creek Greenbelt (2600 N. Lamar Blvd.) is a PARD-designated off-leash area (DOLA) per the official City of Austin DOLA map (March 2023). The DOLA is a bounded park area, not the 6.82-mile trail. PARD trail directory classifies the trail as 'Shared Use (Hike and Bike)' with no off-leash designation.",
  },
  "colorado-river-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must be 6 feet or shorter per Austin Urban Trails program rules. Colorado River Trail is not a designated off-leash area (DOLA). No off-leash zones exist along the trail corridor.",
    policySourceUrl: "https://www.austintexas.gov/urbantrails",
    policySourceTitle: "Urban Trails | City of Austin",
    policyConfidence: 0.82,
    policyMethod: "manual_seed",
    policyNotes: "No dedicated city page exists under the name 'Colorado River Trail.' The trail along the Colorado River in Austin is part of the Urban Trails program, which explicitly requires pets to be 'leashed only (6 feet or shorter)' on all urban trail corridors. The City of Austin DOLA list does not include any Colorado River Trail segment as a designated off-leash area. Policy is derived from the Urban Trails program rules page and the Austin City Code Title 3 leash ordinance (§3-4-1), which mandates leashes in all public areas not specifically designated otherwise. Confidence 0.82 rather than higher because no trail-specific rules page exists for this trail name.",
  },
  "zilker-metro-loop": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required (6 feet or shorter) on the Zilker Metro Loop trail itself — it is classified 'Shared Use (Hike and Bike)' in the city Trail Directory and is not designated off-leash. Zilker Park does contain an officially designated unfenced DOLA (one of Austin's 12 permanent off-leash areas), but that designation applies to a separate interior area of the park (the open field/Great Lawn area near 2100 Barton Springs Rd.), not the 1.99-mile perimeter loop trail. Owners must carry a leash at all times even within the DOLA.",
    policySourceUrl: "https://www.austintexas.gov/department/dog-parks-leash-areas",
    policySourceTitle: "Dog Parks: Off-Leash Areas | AustinTexas.gov",
    policyConfidence: 0.8,
    policyMethod: "manual_seed",
    policyNotes: "Zilker Park (PARK_ID 324) is confirmed as an unfenced DOLA on the City of Austin's official off-leash GIS dataset (12 total DOLAs citywide). The Zilker Metro Loop trail is listed separately in the PARD Trail Directory (2201 Barton Springs Rd., 1.99 miles, Shared Use Hike and Bike) — no off-leash designation on the trail itself. The DOLA zone is an interior open-field area of the park, not the perimeter loop. The Austin Urban Trails program requires leashes of 6 feet or shorter on all urban trail corridors. Confidence 0.8: DOLA existence is confirmed via official GIS, but the precise DOLA polygon boundary relative to the trail tread is not available in readable form (DOLA map PDFs are binary-encoded); geographic inference is based on structural distinction between perimeter loop trail and interior park open space. Note: 'Little Zilker DOLA' pilot (separate neighborhood park) ended December 2024 — unrelated to Zilker Metropolitan Park.",
  },
  "barton-corridor": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must be 6 feet or shorter. No designated off-leash zones exist anywhere within the greenbelt.",
    policySourceUrl: "https://www.austintexas.gov/department/barton-creek-greenbelt",
    policySourceTitle: "Barton Creek Greenbelt | City of Austin Parks and Recreation Department",
    policyConfidence: 0.95,
    policyMethod: "manual_seed",
    policyNotes: "Official PARD page states explicitly: 'Keep pets close to you and on leashes (leash must be 6 feet or shorter).' Greenbelt is not a DOLA and has no off-leash zones. PARD trail directory lists it as 'Shared Use' (no off-leash designation), unlike the two explicitly off-leash Austin trails (Emma Long Metro Park Turkey Creek Trail, Mary Moore Searight Metro Park). 'Barton Corridor' and 'Barton Creek Greenbelt' refer to the same PARD managed area. Blue-green algae caution: seasonal advisories issued for Barton Creek (notably Sculpture Falls area); dogs should not enter water when scum or film is visible.",
  },
};
