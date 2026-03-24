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
  "red-line-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must be 6 feet or shorter per Austin Urban Trails program rules. No designated off-leash areas exist along the trail corridor.",
    policySourceUrl: "https://www.austintexas.gov/urbantrails",
    policySourceTitle: "Urban Trails | City of Austin",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "The Red Line Trail is a multi-segment urban trail corridor running along Capital Metro's commuter rail right-of-way from downtown Austin toward Leander/Cedar Park. Currently open sections include the Boggy Creek Trail segment (Rosewood Ave to MLK Jr. Station), the ACC Highland Campus to Crestview Station segment, and a Crestview-to-US-290 segment. Managing agencies include COA Parks and Recreation, COA Transportation and Public Works, and Capital Metro. The Boggy Creek Trail section explicitly confirms dogs are welcome on leash. Standard Austin Urban Trails rules apply to all COA-managed segments. No off-leash designation exists on this corridor.",
  },
  "walnut-creek-corridor-northern-walnut-creek-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required (6 feet or shorter) on the trail corridor at all times per Austin Urban Trails program rules. Off-leash permitted only within the designated DOLA inside Walnut Creek Metropolitan Park (12138 N. Lamar Blvd.) — an unfenced area covering the northern portion of the park, north of the Walnut Creek waterway. Dogs must be leashed south of the creek and on the trail itself.",
    policySourceUrl: "https://www.austintexas.gov/department/dog-parks-leash-areas",
    policySourceTitle: "Dog Parks: Off-Leash Areas | AustinTexas.gov",
    policyConfidence: 0.80,
    policyMethod: "manual_seed",
    policyNotes: "The Northern Walnut Creek Trail (5.1 mi) is a concrete two-lane path from Balcones District Park to Walnut Creek Metropolitan Park, with 9 creek crossings. The trail terminates at Walnut Creek Metro Park. The park's DOLA boundary is described as 'from the top northern boundary of the park to the Creek' — dogs off-leash north of Walnut Creek, leashed south of it. The trail itself, winding along the creek, is on-leash under standard Austin Urban Trails rules. The DOLA is within the park grounds, distinct from the trail corridor. Same DOLA as the Southern Walnut Creek Trail (already seeded), but the northern trail enters from the west side. Confidence 0.80 because the DOLA boundary relative to the trail tread is inferred from structural distinction between trail corridor and park interior.",
  },
  "onion-creek-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required (6 feet or shorter) on the Onion Creek Trail itself per Austin Urban Trails program rules. Off-leash permitted only within the designated DOLA inside Onion Creek Metropolitan Park (7001 Onion Creek Dr.) — an unfenced 106-acre greenbelt area north of Onion Creek. The paved trail runs south of the creek and is on-leash.",
    policySourceUrl: "https://www.austintexas.gov/department/dog-parks-leash-areas",
    policySourceTitle: "Dog Parks: Off-Leash Areas | AustinTexas.gov",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "Onion Creek Metropolitan Park (517 acres total) contains an unfenced DOLA accessed from 6800 Onion Creek Drive on the north side of the creek. The DOLA boundary is Onion Creek itself: off-leash north of the creek, on-leash south. The existing 4.7-mile Onion Creek Trail urban trail runs near/through the park complex, with the main paved trail south of the creek (on-leash). The 'Dog Park Path (Onion Creek Greenbelt Trail)' is a separate trail within the park system specifically for off-leash use. Standard DOLA rules apply: dogs must remain within sight and sound control, owner must carry a leash, rabies vaccination required, waste removal required.",
  },
  "lab": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must be 6 feet or shorter per Austin Urban Trails program rules. The Lance Armstrong Bikeway is not a designated off-leash area.",
    policySourceUrl: "https://www.austintexas.gov/urbantrails",
    policySourceTitle: "Urban Trails | City of Austin",
    policyConfidence: 0.80,
    policyMethod: "manual_seed",
    policyNotes: "The LAB (Lance Armstrong Bikeway) is a mixed on-street and off-street bikeway running east-west across central Austin. Managed by COA Parks and Recreation and COA Transportation and Public Works. No specific trail-level dog rules differ from the standard Austin Urban Trails policy. The trail connects to the southern end of Shoal Creek Trail at W. 3rd St / Cesar Chavez, but the Shoal Creek DOLA is at the north end (~2 miles away) — not adjacent for practical purposes. No off-leash designation exists on the LAB corridor.",
  },
  "johnson-creek-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must be 6 feet or shorter per Austin Urban Trails program rules. Johnson Creek Greenbelt is not a designated off-leash area.",
    policySourceUrl: "https://www.austintexas.gov/urbantrails",
    policySourceTitle: "Urban Trails | City of Austin",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "Johnson Creek Greenbelt Trail (2100 Veterans Dr) is a concrete hike-and-bike trail along MoPac between Veterans Drive and Enfield Road. AllTrails, BringFido, and TrailLink all confirm dogs allowed on leash. Managed by COA Parks and Recreation and COA Transportation and Public Works. Standard Austin Urban Trails rules apply. Nearest DOLA is West Austin Neighborhood Park (1317 W. 10th St), roughly 0.5–1 mile east across MoPac — not on the trail.",
  },
  "country-club-creek-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must be 6 feet or shorter per Austin Urban Trails program rules. No designated off-leash areas exist along the trail corridor.",
    policySourceUrl: "https://www.austintexas.gov/urbantrails",
    policySourceTitle: "Urban Trails | City of Austin",
    policyConfidence: 0.75,
    policyMethod: "manual_seed",
    policyNotes: "Country Club Creek Trail connects Mable Davis Park to Roy G. Guerrero Colorado River Metro Park (400 Grove Blvd) in southeast Austin. Managed by COA Parks and Recreation and COA Transportation and Public Works. Standard Austin Urban Trails rules apply. One source mentioned an 'off-leash dog area' at Roy Guerrero Metro Park, but this does not appear on the City of Austin's official DOLA list (March 2023) — it may be an informal area or outdated information. Confidence 0.75 because of the unconfirmed Roy Guerrero off-leash claim.",
  },
  "wells-branch-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times on the trail. City of Austin segments follow Urban Trails rules (6 feet or shorter). Wells Branch MUD segments require physical restraint at all times (no specific length stated). Two MUD off-leash areas (Willow Bend Dog Park and Big Basin Off Leash Area) are near the trail but are separate facilities — not on the trail corridor.",
    policySourceUrl: "https://wellsbranchmud.com/74-parks-a-recreation/parks/parks-rules",
    policySourceTitle: "Park Rules | Wells Branch MUD",
    policyConfidence: 0.80,
    policyMethod: "manual_seed",
    policyNotes: "Wells Branch Trail spans Austin, Austin ETJ, and Pflugerville jurisdictions. Managing agencies include both Wells Branch MUD and COA Transportation and Public Works. Wells Branch MUD park rules explicitly state: 'All dogs in the Parks must have all required vaccinations and, except for the Dog Parks, must be confined to a leash under the physical control and restraint by their owners at all times.' E-collars do not satisfy the leash rule under MUD ordinance. The MUD's two off-leash areas (Willow Bend Dog Park, Big Basin Off Leash Area) are near the trail system but are MUD-designated facilities, not City of Austin DOLAs. Austin City Code §3-4-1 applies to city-managed portions. Dual-authority outcome is the same: leash required on trail.",
  },
  "gillieland-creek-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code §3-4-1. No designated off-leash areas along the trail corridor.",
    policySourceUrl: "https://www.austintexas.gov/urbantrails",
    policySourceTitle: "Urban Trails | City of Austin",
    policyConfidence: 0.70,
    policyMethod: "manual_seed",
    policyNotes: "The 'Gillieland Creek Trail' in the Austin Urban Trails open data (jdwm-wfps) is a distinct regional trail corridor from the well-documented 'Gilleland Creek Trail' in Pflugerville. The Austin dataset shows managing agencies as 'Not Determined' and 'Other' for the Gillieland Creek Trail, with existing segments being a small portion of the larger planned regional corridor. Because specific trail management details for this corridor are sparse and the managing agency is unconfirmed, confidence is 0.70 — baseline Austin Urban Trails rules apply by default since the trail is within Austin city limits.",
  },
  "mokan-corridor-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must be 6 feet or shorter per Austin Urban Trails program rules. No designated off-leash areas on the corridor.",
    policySourceUrl: "https://www.austintexas.gov/urbantrails",
    policySourceTitle: "Urban Trails | City of Austin",
    policyConfidence: 0.80,
    policyMethod: "manual_seed",
    policyNotes: "The MoKan Corridor Trail follows a former Missouri-Kansas-Texas Railroad right-of-way in east Austin, connecting the Pedernales St protected bike path to the Southern Walnut Creek Trail. Managed by COA Transportation and Public Works. A new trailhead near Bolm Road (opened July 2025) includes a water fountain with a dog-friendly bowl, indicating dogs are explicitly anticipated on this trail. Standard Austin Urban Trails rules apply. Full planned corridor extends to Pflugerville but existing Austin section is 1.2 miles.",
  },
  "183-tollway-shared-use-path": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times. CTRMA policy: 'Dogs are welcome but should remain on leash.' Austin City Code §3-4-1 also applies. No designated off-leash areas on the path.",
    policySourceUrl: "https://www.mobilityauthority.com/shared-use-paths",
    policySourceTitle: "Shared Use Paths | Central Texas Regional Mobility Authority",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "The 183 Trail runs along US 183/183 Toll from US 290 to SH 71. Operated by the Central Texas Regional Mobility Authority (CTRMA), not the City of Austin Urban Trails Program. CTRMA publishes a blanket pet policy for all shared-use paths: dogs welcome, leash required. No specific leash length stated by CTRMA, but Austin City Code §3-4-1 requires leash in all public areas. The 183 Tollway path (US 183) is distinct from the 183A path (northwest corridor toward Cedar Park/Leander).",
  },
  "ih-35-shared-use-path": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must be 6 feet or shorter per Austin Urban Trails program rules. No designated off-leash areas on the path.",
    policySourceUrl: "https://www.austintexas.gov/urbantrails",
    policySourceTitle: "Urban Trails | City of Austin",
    policyConfidence: 0.75,
    policyMethod: "manual_seed",
    policyNotes: "IH-35 Shared Use Path runs along the I-35 expansion project corridor. Part of Austin's urban trail network; City of Austin is the most likely managing entity for urban trail corridors along the IH-35 expansion (COA/TxDOT partnership). No trail-specific dog policy page found. Applying the Urban Trails Program's universal 6-foot leash rule is the conservative and most defensible policy. Confidence 0.75 because no CTRMA or TxDOT page explicitly names the IH-35 Shared Use Path with a dog policy.",
  },
  "us-290-manor-expressway-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times. CTRMA policy: dogs welcome, leash required. Austin City Code §3-4-1 also applies. No designated off-leash areas on the path.",
    policySourceUrl: "https://www.mobilityauthority.com/shared-use-paths",
    policySourceTitle: "Shared Use Paths | Central Texas Regional Mobility Authority",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "The 290 Toll Shared Use Path runs parallel to the US 290 Toll (Manor Expressway) from Austin east toward Manor. Operated by CTRMA. TrailLink confirms this is a paved path, dog-friendly. Trail is heavily sun-exposed toward Manor end; no water fountains reported. The BarkTrails slug 'us-290-manor-expressway-trail' maps to what TrailLink calls the '290 Toll Shared Use Path.'",
  },
  "sh-71-shared-use-path": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times. CTRMA policy: dogs welcome, leash required. Austin City Code §3-4-1 also applies. No designated off-leash areas on the path.",
    policySourceUrl: "https://www.mobilityauthority.com/projects-programs/shared-use-paths/71/",
    policySourceTitle: "71 Trail | Central Texas Regional Mobility Authority",
    policyConfidence: 0.88,
    policyMethod: "manual_seed",
    policyNotes: "The 71 Trail runs along SH 71 from US 183 to SH 130, operated by CTRMA. Connects to the 183 Trail and provides access toward Austin-Bergstrom International Airport. AllTrails lists it as '71 Toll Lane Shared Use Path' — dogs on leash confirmed. CTRMA blanket pet policy applies. Austin City Code §3-4-1 also applies independently.",
  },
  "sh-45-shared-use-path": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times. CTRMA policy: dogs welcome, leash required. Austin City Code §3-4-1 also applies. No designated off-leash areas on the path.",
    policySourceUrl: "https://www.mobilityauthority.com/projects-programs/shared-use-paths/45sw/",
    policySourceTitle: "45SW Trail | Central Texas Regional Mobility Authority",
    policyConfidence: 0.88,
    policyMethod: "manual_seed",
    policyNotes: "The 45SW Trail runs along SH 45 SW, operated by CTRMA. AllTrails lists '45SW Shared Use Path' as dog-friendly (dogs on leash). CTRMA blanket pet policy applies. Austin City Code §3-4-1 also applies independently.",
  },
  "austin-to-manor-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must be 6 feet or shorter per Austin Urban Trails program rules. No designated off-leash areas on the trail.",
    policySourceUrl: "https://www.austintexas.gov/urbantrails",
    policySourceTitle: "Urban Trails | City of Austin",
    policyConfidence: 0.82,
    policyMethod: "manual_seed",
    policyNotes: "Austin to Manor Trail runs from Austin toward Manor parallel to US 290. Partially overlaps with or connects to the CTRMA 290 Toll path corridor. AllTrails lists it with 81 reviews and confirms dogs on leash. The trail falls under Austin Urban Trails program rules. Austin City Code §3-4-1 also applies.",
  },
  "howard-ln-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code §3-4-1. No designated off-leash areas on the trail.",
    policySourceUrl: "https://www.austintexas.gov/urbantrails",
    policySourceTitle: "Urban Trails | City of Austin",
    policyConfidence: 0.70,
    policyMethod: "manual_seed",
    policyNotes: "Howard Lane Trail (4.9 mi) is a shared-use path along Howard Lane. Travis County's Citizens Bond Advisory Committee listed a 'Howard Lane Shared Use Path' project on the south side of Howard Lane (McNeil Drive). May be managed by City of Austin or Travis County. No trail-specific dog policy page found. Austin City Code §3-4-1 applies — leash required in all public areas. Confidence 0.70 because the trail's managing entity is unconfirmed and no AllTrails or TrailLink listing was found.",
  },
  "mopac-shared-use-path": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times. CTRMA policy: dogs welcome, leash required. Austin City Code §3-4-1 also applies. No designated off-leash areas on the path.",
    policySourceUrl: "https://www.mobilityauthority.com/projects-programs/shared-use-paths/mopac/",
    policySourceTitle: "MoPac Trail | Central Texas Regional Mobility Authority",
    policyConfidence: 0.88,
    policyMethod: "manual_seed",
    policyNotes: "MoPac Trail runs along Loop 1 (MoPac Expressway) from Parmer Lane to the Colorado River, operated by CTRMA. CTRMA blanket pet policy applies: dogs welcome, leash required. Austin City Code §3-4-1 also applies independently. No off-leash designation exists on this corridor.",
  },
  "mckinney-falls-parkway-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times; leash must be no longer than 6 feet. Dogs are not allowed in the water at Upper or Lower Falls areas. Texas Parks & Wildlife Department rules apply.",
    policySourceUrl: "https://tpwd.texas.gov/state-parks/mckinney-falls",
    policySourceTitle: "McKinney Falls State Park | Texas Parks & Wildlife Department",
    policyConfidence: 0.78,
    policyMethod: "manual_seed",
    policyNotes: "McKinney Falls Parkway Trail (2.1 mi) runs along McKinney Falls Parkway within or adjacent to McKinney Falls State Park (5808 McKinney Falls Pkwy, Austin TX 78744). TPWD rules apply: leash no longer than 6 feet at all times on all trails and in the campground. Dogs are not allowed in the water (Upper and Lower Falls areas). Day-use fee of $6/adult applies. The governing authority is TPWD, not the City of Austin Urban Trails Program. Confidence 0.78 because the TPWD trails-info page does not list a specific trail named 'McKinney Falls Parkway Trail' — it may be the paved road-parallel path or a segment of the park's Onion Creek trail system.",
  },

  // ============================================================
  // Houston, TX — Policy Seeds
  // ============================================================
  // Baseline: Houston City Ordinance Chapter 6 requires leash at
  // all times on all public property. Harris County regulations
  // mirror this for unincorporated areas. Off-leash only in
  // designated fenced dog parks per Chapter 32 Sec. 32-11.
  // ============================================================

  "buffalo-bayou-greenway": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required at all times on the trail per Houston City Ordinance Chapter 6. Off-leash permitted only inside the fenced Johnny Steele Dog Park (2929 Allen Pkwy, 2 acres, separate large/small dog areas).",
    policySourceUrl: "https://buffalobayou.org/location/buffalo-bayou-park/",
    policySourceTitle: "Buffalo Bayou Park | Buffalo Bayou Partnership",
    policyConfidence: 0.92,
    policyMethod: "manual_seed",
    policyNotes: "Buffalo Bayou Partnership rules: 'Pets must remain on leashes except in Dog Parks.' Johnny Steele Dog Park hours: 7 AM-8 PM. Max 2 dogs per person. No puppies under 4 months. No children 12 or under in dog park.",
  },
  "brays-bayou-greenway": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required at all times on the greenway per Houston City Ordinance Chapter 6. Off-leash only inside fenced McWilliams Dog Park in Hermann Park and small fenced dog park at Mason Park, both adjacent to the greenway.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "The Brays Bayou Greenway passes through Hermann Park (McWilliams Dog Park, open Tue-Sun 6 AM-11 PM) and Mason Park (small fenced dog park).",
  },
  "white-oak-bayou-greenway": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required at all times on the greenway per Houston City Ordinance Chapter 6. Off-leash only inside the fenced T.C. Jester Dog Park (4201 W T.C. Jester Blvd, 1.08 acres) adjacent to the greenway.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.88,
    policyMethod: "manual_seed",
    policyNotes: "T.C. Jester Dog Park features 31,000 sq ft large dog run and 16,000 sq ft small dog run with benches and dog drinking fountains.",
  },
  "sims-bayou-greenway": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. No designated off-leash dog parks along the Sims Bayou Greenway corridor.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.82,
    policyMethod: "manual_seed",
  },
  "greens-bayou-greenway-paved-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. No designated off-leash dog parks along the Greens Bayou Greenway corridor.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.78,
    policyMethod: "manual_seed",
  },
  "greens-bayou-greenway-natural-surface-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. No designated off-leash dog parks along the Greens Bayou Greenway corridor.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.78,
    policyMethod: "manual_seed",
  },
  "halls-bayou-greenway": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. No designated off-leash dog parks along the Halls Bayou Greenway corridor.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.75,
    policyMethod: "manual_seed",
  },
  "hunting-bayou-greenway": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. No designated off-leash dog parks along the Hunting Bayou Greenway corridor.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.78,
    policyMethod: "manual_seed",
  },
  "san-jacinto-bayou-greenway": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.75,
    policyMethod: "manual_seed",
  },
  "memorial-park-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs must remain on leash at all times per Memorial Park Conservancy rules. Dogs not permitted in park water features or Hines Lake. Seymour Lieberman Trail (crushed granite) is recommended for dogs.",
    policySourceUrl: "https://www.memorialparkconservancy.org/visit/general-park-info/",
    policySourceTitle: "General Park Information | Memorial Park Conservancy",
    policyConfidence: 0.92,
    policyMethod: "manual_seed",
    policyNotes: "Memorial Park Conservancy: 'Dogs are welcome in the Park but must remain on their leash at all times.' No off-leash dog park within Memorial Park.",
  },
  "hermann-park": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required at all times throughout the park. Off-leash only inside the fenced McWilliams Dog Park (1598 S MacGregor Way). Dogs prohibited on the train, carousel, pedal boats, Play Garden, and all buildings.",
    policySourceUrl: "https://hermannpark.org/faqs/",
    policySourceTitle: "Frequently Asked Questions | Hermann Park Conservancy",
    policyConfidence: 0.93,
    policyMethod: "manual_seed",
    policyNotes: "Hermann Park FAQ: 'Dogs are permitted in Hermann Park on a leash' and 'McWilliams Dog Park is the only area where dogs are permitted to be off leash.' McWilliams opened Oct 2023, Tue-Sun 6 AM-11 PM.",
  },
  "terry-hershey-park": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required (6 feet or shorter) at all times on trails per Harris County Precinct 4 rules. Off-leash only inside the fenced Millie Bush Bark Park (16756 Westheimer Pkwy, 13 acres) in adjacent George Bush Park.",
    policySourceUrl: "https://cp4.harriscountytx.gov/Explore/Parks/Policies-Regulations",
    policySourceTitle: "Policies & Regulations | Harris County Precinct 4 Parks",
    policyConfidence: 0.90,
    policyMethod: "manual_seed",
    policyNotes: "HC Pct. 4: 'All dogs must be on a leash that is 6-feet long or less.' Millie Bush Bark Park is 13 acres with three small lakes and separate large/small dog sections.",
  },
  "heights-hike-bike-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. No designated off-leash dog parks on the trail corridor.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
  },
  "spring-creek-greenway": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required (6 feet or shorter) at all times per Harris County Precinct 4 rules. No designated off-leash dog parks on the greenway.",
    policySourceUrl: "https://cp4.harriscountytx.gov/Explore/Parks/Policies-Regulations",
    policySourceTitle: "Policies & Regulations | Harris County Precinct 4 Parks",
    policyConfidence: 0.88,
    policyMethod: "manual_seed",
    policyNotes: "Spring Creek Greenway is 14.5 miles managed by Harris County Precinct 4. Wildlife-sensitive corridor with gray foxes, bald eagles, and bald cypress.",
  },
  "cypress-creek-greenway": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County park rules. No designated off-leash dog parks on the greenway.",
    policySourceUrl: "https://cp4.harriscountytx.gov/Explore/Parks/Policies-Regulations",
    policySourceTitle: "Policies & Regulations | Harris County Precinct 4 Parks",
    policyConfidence: 0.80,
    policyMethod: "manual_seed",
  },
  "kingwood-greenbelt-trails": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. Kingwood is within Houston city limits.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "Kingwood greenbelt trail system features 75+ miles of trails through 'Houston's Livable Forest.' No off-leash dog park within the greenbelt system.",
  },
  "bay-area-hike-and-bike-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times. Dogs NOT allowed at adjacent Armand Bayou Nature Center even on leash.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.78,
    policyMethod: "manual_seed",
    policyNotes: "Trail crosses multiple jurisdictions (Houston, Pasadena, unincorporated Harris County). ABNC prohibits all pets for wildlife safety.",
  },
  "columbia-tap": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. No designated off-leash dog parks on the trail.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
  },
  "buffalo-bayou-park": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required at all times on trails per Buffalo Bayou Partnership rules. Off-leash only inside the fenced Johnny Steele Dog Park (2929 Allen Pkwy).",
    policySourceUrl: "https://buffalobayou.org/location/buffalo-bayou-park/",
    policySourceTitle: "Buffalo Bayou Park | Buffalo Bayou Partnership",
    policyConfidence: 0.92,
    policyMethod: "manual_seed",
  },
  "tom-bass-regional-park": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required at all times on park trails. Off-leash only inside the fenced Tom Bass K-9 Dog Park (3452 Fellows Rd, 10 acres, separate large/small dog areas).",
    policySourceUrl: "https://www.hcp1.net/TomBassPark",
    policySourceTitle: "Tom Bass Park | Harris County Precinct 1",
    policyConfidence: 0.88,
    policyMethod: "manual_seed",
  },
  "mason-park-trails": {
    dogsAllowed: "allowed",
    leashPolicy: "conditional",
    leashDetails: "Leash required at all times on park trails per Houston City Ordinance Chapter 6. A small fenced off-leash dog park area exists within Mason Park.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.80,
    policyMethod: "manual_seed",
  },
  "arthur-storey-park": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. No off-leash dog park at Arthur Storey Park.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72,
    policyMethod: "manual_seed",
  },

  // ============================================================
  // Houston, TX — Baseline coverage (slug aliases + remaining trails)
  // All entries apply Houston City Ordinance Chapter 6 or Harris County
  // park rules as the baseline: leash required, dogs allowed.
  // ============================================================

  // Slug aliases — DB slug differs from the originally seeded keys above
  "bay-area-hike-bike-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times. Dogs NOT allowed at adjacent Armand Bayou Nature Center even on leash.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.78,
    policyMethod: "manual_seed",
    policyNotes: "Trail crosses multiple jurisdictions (Houston, Pasadena, unincorporated Harris County). Armand Bayou Nature Center prohibits all pets for wildlife safety.",
  },
  "kingwood-trails": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. Kingwood is within Houston city limits.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "Kingwood greenbelt trail system features 75+ miles of trails. No off-leash dog park within the greenbelt system.",
  },

  // Armand Bayou corridor — city-managed H&B trail (NOT the Nature Center, which prohibits dogs)
  "armand-bayou-hike-and-bike-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. The trail runs along Armand Bayou but is separate from the Armand Bayou Nature Center, which prohibits all pets.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.75,
    policyMethod: "manual_seed",
    policyNotes: "Armand Bayou Nature Center (ABNC) prohibits pets for wildlife safety. The H&B trail is managed by Houston Parks & Recreation and follows city leash ordinance.",
  },
  "armand-bayou-hike-and-bike-trail-fairmont": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. Trail segment adjacent to Armand Bayou Nature Center, which prohibits all pets.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.75,
    policyMethod: "manual_seed",
  },

  // Harris County Precinct 4 parks (higher-quality trail systems)
  "jesses-h-jones-trails": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County Precinct 4 park rules. Jesse H. Jones Park is a 310-acre forest preserve with 12+ miles of hiking trails.",
    policySourceUrl: "https://cp4.harriscountytx.gov/Explore/Parks/Policies-Regulations",
    policySourceTitle: "Policies & Regulations | Harris County Precinct 4 Parks",
    policyConfidence: 0.82,
    policyMethod: "manual_seed",
  },
  "terry-hershey-park-trails": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County Precinct 4 park rules. Terry Hershey Park runs 10 miles along Buffalo Bayou's west fork.",
    policySourceUrl: "https://cp4.harriscountytx.gov/Explore/Parks/Policies-Regulations",
    policySourceTitle: "Policies & Regulations | Harris County Precinct 4 Parks",
    policyConfidence: 0.82,
    policyMethod: "manual_seed",
  },
  "george-bush-park-h-b-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County Precinct 3 park rules. George Bush Park is a 7,800-acre regional park.",
    policySourceUrl: "https://hcp3.net/parks/george-bush-park/",
    policySourceTitle: "George Bush Park | Harris County Precinct 3",
    policyConfidence: 0.80,
    policyMethod: "manual_seed",
  },
  "spring-creek-nature-trail": {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County Precinct 4 park rules. Spring Creek Nature Trail runs through sensitive riparian habitat.",
    policySourceUrl: "https://cp4.harriscountytx.gov/Explore/Parks/Policies-Regulations",
    policySourceTitle: "Policies & Regulations | Harris County Precinct 4 Parks",
    policyConfidence: 0.80,
    policyMethod: "manual_seed",
  },

  // Remaining Houston/Harris County trails — standard leash-required baseline
  "river-grove-park": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "connection-to-rankin-by-others": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "mike-driscoll-park": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "woodland-hills-to-us-59": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "brays-bayou-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "tony-marron-park-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "lake-forest-park-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "eldridge-detention-to-mcclendon-park": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "mcclendon-park": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "white-oak-bayou-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "nicholson-st": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "white-oak-h-b-trail-pct-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County Precinct 1 park rules.",
    policySourceUrl: "https://www.hcp1.net/",
    policySourceTitle: "Harris County Precinct 1 Parks",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "gears-rd-to-greens-parkway": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "sims-bayou-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "newcastle-st": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "briarwick-to-keith-wiess-park": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "milby-park-to-galveston-road-sims-bayou": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "westchase-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "houston-unknown-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "archbishop-joseph-a-fiorenza-h-b-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "lockwood-to-us-59": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "bryce-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "herman-brown-park-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "brock-park": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "keith-wiess-park": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "greens-bayou-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "hogg-bird-sanctuary-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6. Trail is within the Houston city park system along Buffalo Bayou.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "gus-wortham-park": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "centerpoint-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "spring-branch-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "keegans-bayou-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "faulkey-gully": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "brays-bayou-connector": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "drainage-corridor": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "maxey-rd-sidewalks": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "cypresswood-equestrian-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County park rules. Equestrian trail — keep dogs close and under control around horses.",
    policySourceUrl: "https://cp4.harriscountytx.gov/Explore/Parks/Policies-Regulations",
    policySourceTitle: "Policies & Regulations | Harris County Precinct 4 Parks",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "turkey-creek-park-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "hcfcd-54-acre-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County Flood Control District rules.",
    policySourceUrl: "https://www.hcfcd.org/",
    policySourceTitle: "Harris County Flood Control District",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "cypresswood-park-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County park rules.",
    policySourceUrl: "https://cp4.harriscountytx.gov/Explore/Parks/Policies-Regulations",
    policySourceTitle: "Policies & Regulations | Harris County Precinct 4 Parks",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "sandpiper-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "collins-bike-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "ymca-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "cypress-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County park rules.",
    policySourceUrl: "https://cp4.harriscountytx.gov/Explore/Parks/Policies-Regulations",
    policySourceTitle: "Policies & Regulations | Harris County Precinct 4 Parks",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "bike-barn-access-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "strawberry-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "emnora-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "first-tee-golf-facility-road": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "hutcheson-park": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "jensen-to-mckee": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "f-m-law-park-connector-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "vogel-creek-greenway": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "reddleshire-connector": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "addicks-reservoir": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times. Addicks Reservoir is managed by the US Army Corps of Engineers; Houston city ordinance applies on maintained trail areas.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "brays-oaks-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "almeda-rd": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "holly-hall-st": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "harrisburg-sunset-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "houston-international-promenade-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "fondren-channel-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "west-hc-mud-11-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County MUD rules and Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "gessner-basin-s": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "west-hc-mud-9-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Harris County MUD rules and Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "jersey-village-h-b-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per City of Jersey Village ordinance.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "hollister-detention-basin-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "ranchstone-basin": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  "sharpstown-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Houston City Ordinance Chapter 6.",
    policySourceUrl: "https://www.houstontx.gov/parks/parkrules.html",
    policySourceTitle: "Park Safety and Park Rules | Houston Parks and Recreation",
    policyConfidence: 0.72, policyMethod: "manual_seed",
  },
  // ── AUSTIN OSM BULK (dogs allowed, leash required per Austin City Code § 3-5-3) ──────
  // 34th St To 35th St Bike Ped Connector
  "34th-st-to-35th-st-bike-ped-connector": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Alderbrook Trail 1
  "alderbrook-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Alderbrook Trail 2
  "alderbrook-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Alderbrook Trail 3
  "alderbrook-trail-3": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Alsatia Trail
  "alsatia-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // ALT - Good Water Trail Loop
  "alt-good-water-trail-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // ALT Goodwater Trail Loop
  "alt-goodwater-trail-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Arbor Trail Retail Walking Path
  "arbor-trail-retail-walking-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Arboretum Trail
  "arboretum-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Arrundo Path
  "arrundo-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Bailout Trail
  "bailout-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barker Hollow to Cascade Caverns Connector
  "barker-hollow-to-cascade-caverns-connector": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barker Ranch Path
  "barker-ranch-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barstow Trail
  "barstow-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barton Creek Greenbelt
  "barton-creek-greenbelt": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barton Creek Greenbelt / Hill of Life Trail
  "barton-creek-greenbelt-hill-of-life-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barton Creek Greenbelt Mopac Trail Entrance
  "barton-creek-greenbelt-mopac-trail-entrance": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barton Creek Greenbelt Trail 10
  "barton-creek-greenbelt-trail-10": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barton Creek Greenbelt Trail 11
  "barton-creek-greenbelt-trail-11": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barton Creek Greenbelt Trail 24
  "barton-creek-greenbelt-trail-24": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barton Creek Greenbelt & Violet CrownTrail
  "barton-creek-greenbelt-violet-crowntrail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barton Creek Mopac Mobility Bridge
  "barton-creek-mopac-mobility-bridge": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Barton Creek Pedestrian Path
  "barton-creek-pedestrian-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Bat House Trail
  "bat-house-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Bauerle Creek Trail 2
  "bauerle-creek-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Bear Lake Jeep Track
  "bear-lake-jeep-track": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Bell Trail
  "bell-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Bergstrom Spur Trail
  "bergstrom-spur-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Bevo Trail
  "bevo-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Big Walnut Creek Path
  "big-walnut-creek-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Blue Trail
  "blue-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Bluinn Creek Connection
  "bluinn-creek-connection": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // BMX Loop
  "bmx-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Boggy Creek Greenbelt Trail
  "boggy-creek-greenbelt-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Boggy Creek Trail
  "boggy-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Brentwood Neighborhood Park Trail
  "brentwood-neighborhood-park-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Brown Trail
  "brown-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Bull Creek South To North
  "bull-creek-south-to-north": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Bull Creek West Loop
  "bull-creek-west-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Bullnettle Trail
  "bullnettle-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Burn Line Trail
  "burn-line-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Cactus Ridge Trail
  "cactus-ridge-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Campground Trail
  "campground-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Canyon Creek Nature Trail
  "canyon-creek-nature-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Canyon Trail
  "canyon-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Canyonlands Trail
  "canyonlands-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Chickadee Loop
  "chickadee-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Chris Mosqueda Hike and Bike Trail
  "chris-mosqueda-hike-and-bike-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Circle C Metro Park Hike and Bike Trail
  "circle-c-metro-park-hike-and-bike-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Circle C Metro Park Hike & Bike Trail
  "circle-c-metro-park-hike-bike-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Circuit of the Americas pedestrian path
  "circuit-of-the-americas-pedestrian-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Cliff Loop Trail
  "cliff-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Colony Loop Drive
  "colony-loop-drive": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Colony Park Loop Trail
  "colony-park-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Convict Hill Quarry Nature Trail 1
  "convict-hill-quarry-nature-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Convict Hill Quarry Nature Trail 2
  "convict-hill-quarry-nature-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Convict Hill Quarry Nature Trail 3
  "convict-hill-quarry-nature-trail-3": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Convict Hill Quarry Nature Trail 4
  "convict-hill-quarry-nature-trail-4": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Convict Hill Quarry Nature Trail 5
  "convict-hill-quarry-nature-trail-5": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Covered Bridge Hiking Trail
  "covered-bridge-hiking-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Cow Path Shortcut
  "cow-path-shortcut": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Cow Path Shortcut Part 1.5
  "cow-path-shortcut-part-1-5": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Cow Path Shortcut Part 2
  "cow-path-shortcut-part-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Coyote Run Trail
  "coyote-run-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Creek Trail
  "creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Creekside Loop
  "creekside-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Cross Creek Lane
  "cross-creek-lane": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Curameng Trail
  "curameng-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Davis Hill Trails
  "davis-hill-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Debug Trail System
  "debug-trail-system": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Decker Lake Road
  "decker-lake-road": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Detention Dam Trail
  "detention-dam-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Dick Nichols Loop Trail
  "dick-nichols-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Dick Nichols Trail 1
  "dick-nichols-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Dick Nichols Trail 2
  "dick-nichols-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Dinosaur Tracks Trail
  "dinosaur-tracks-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Dirt Hill Trail
  "dirt-hill-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Dittmar Trail
  "dittmar-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Dove springs walking path
  "dove-springs-walking-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // East Clifside Trail
  "east-clifside-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // East Creek Trail
  "east-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // East Fenceline Path
  "east-fenceline-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // East Lookout Trail
  "east-lookout-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // East Riverside Trail
  "east-riverside-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // East Spur Trail
  "east-spur-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Egret Loop
  "egret-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Endo Valley Trail
  "endo-valley-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Entrance Trail
  "entrance-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Falls Trail
  "falls-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Firefly Trail
  "firefly-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Flint Rock Loop
  "flint-rock-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // FM 969 Trail
  "fm-969-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Forest Trail
  "forest-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Forest Trail Sidewalk
  "forest-trail-sidewalk": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Franklins Tale Trail
  "franklins-tale-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Frate Barker Path
  "frate-barker-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // FTE/VVE Connection Path
  "fte-vve-connection-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Gaines Creek Neighborhood Park Trail 1
  "gaines-creek-neighborhood-park-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Gaines Creek Neighborhood Park Trail 2
  "gaines-creek-neighborhood-park-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Gaines Creek Neighborhood Park Trail 3
  "gaines-creek-neighborhood-park-trail-3": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Garrick Creek Trail
  "garrick-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Garrick Creek Trail 1
  "garrick-creek-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Garrick Creek Trail 2
  "garrick-creek-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Garrick Creek Trail Bridge
  "garrick-creek-trail-bridge": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Garrison Trail 1
  "garrison-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Garrison Trail 2
  "garrison-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Garrison Trail 3
  "garrison-trail-3": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Garrison Trail 4
  "garrison-trail-4": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Garrison Trail 5
  "garrison-trail-5": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Gatling Gun Park Path
  "gatling-gun-park-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Georgian Dr to Rundberg Ln Trail Connector
  "georgian-dr-to-rundberg-ln-trail-connector": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Gillis District Park Trail
  "gillis-district-park-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Golden Quail Dr to S Meadows Dr
  "golden-quail-dr-to-s-meadows-dr": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Goodwater Loop Trail
  "goodwater-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Gracywoods Neighborhood Park Trail
  "gracywoods-neighborhood-park-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Graffiti Trail
  "graffiti-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Gray Fox Trail
  "gray-fox-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Great Hills Sierra Nevada Path
  "great-hills-sierra-nevada-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Green Trail
  "green-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Greenbelt East Trail
  "greenbelt-east-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Greenbelt Gus Fruh Entrance Trail
  "greenbelt-gus-fruh-entrance-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Hayden's Trail
  "hayden-s-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Highland Cutoff Trail
  "highland-cutoff-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Highland Trail
  "highland-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Highway 71 Cycle Path
  "highway-71-cycle-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Homestead Trail
  "homestead-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Horseshoe Trail
  "horseshoe-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // House of Horror Path
  "house-of-horror-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Iglesia Trail
  "iglesia-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Inner Log Loop
  "inner-log-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // John Barr Trail
  "john-barr-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Johnson Creek Hike and Bike Trail
  "johnson-creek-hike-and-bike-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Jollyville to 360 Connector Trail
  "jollyville-to-360-connector-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Kendra Page Neighborhood Park Trail
  "kendra-page-neighborhood-park-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Lady Bird Lake Hike and Bike Trail
  "lady-bird-lake-hike-and-bike-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Ladybird Johnson Wildflower Center Entrance Path
  "ladybird-johnson-wildflower-center-entrance-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Lake Trail
  "lake-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Lakeline Trail
  "lakeline-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Lamar Blvd To Del Curto Rd Trail
  "lamar-blvd-to-del-curto-rd-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Lamar Blvd Trail
  "lamar-blvd-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Lance Armstrong Bikeway
  "lance-armstrong-bikeway": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Latta Branch Greenbelt Trail
  "latta-branch-greenbelt-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Latta Branch Greenbelt Trail 10
  "latta-branch-greenbelt-trail-10": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Latta Branch Greenbelt Trail 11
  "latta-branch-greenbelt-trail-11": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Latta Branch Greenbelt Trail 12
  "latta-branch-greenbelt-trail-12": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Latta Branch Greenbelt Trail 13
  "latta-branch-greenbelt-trail-13": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Latta Branch Greenbelt Trail 4
  "latta-branch-greenbelt-trail-4": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Latta Branch Greenbelt Trail 5
  "latta-branch-greenbelt-trail-5": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Latta Branch Greenbelt Trail 6
  "latta-branch-greenbelt-trail-6": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Latta Branch Greenbelt Trail 7
  "latta-branch-greenbelt-trail-7": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Latta Branch Greenbelt Trail 8
  "latta-branch-greenbelt-trail-8": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Latta Branch Greenbelt Trail 9
  "latta-branch-greenbelt-trail-9": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Laughter Loop
  "laughter-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Linden Loop
  "linden-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Lindshire Trail
  "lindshire-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Little Fern Trail
  "little-fern-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Little Walnut Creek Trail
  "little-walnut-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Live Oak Trail
  "live-oak-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Log Loops Trail
  "log-loops-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Long Loop Trail
  "long-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Lost Creek Green Belt
  "lost-creek-green-belt": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Lower Island View Trail
  "lower-island-view-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Loyola Lane to US 183 Trail Connector
  "loyola-lane-to-us-183-trail-connector": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Main Temple Back and Side Path
  "main-temple-back-and-side-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Main Temple Exit Path
  "main-temple-exit-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Main Temple Side Path
  "main-temple-side-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Main Temple Small Path to Big Path
  "main-temple-small-path-to-big-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Main Temple to Guru Mandir Path
  "main-temple-to-guru-mandir-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Main Trail
  "main-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Marshitahs Trail
  "marshitahs-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Mary Moore Searight Metro Park Equestrian Trail
  "mary-moore-searight-metro-park-equestrian-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Mary Moore Searight Metro Park Trail
  "mary-moore-searight-metro-park-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Mary Moore Searight Trail 1
  "mary-moore-searight-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Mary Moore Searight Trail 2
  "mary-moore-searight-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Mary Moore Searight Trail 3
  "mary-moore-searight-trail-3": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Meadow View Trail
  "meadow-view-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // MetCenter Hike and Bike Path
  "metcenter-hike-and-bike-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // MetCenter Hike and Bike Trail
  "metcenter-hike-and-bike-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Milwood Trail
  "milwood-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Mm 15 Loop
  "mm-15-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // MoKan Trail
  "mokan-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Montopolis Arboretum Path
  "montopolis-arboretum-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Montopolis Tributary Trail
  "montopolis-tributary-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // MoPac Bridge / Loop 360
  "mopac-bridge-loop-360": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // MoPac Mobility Bridge / Loop 360
  "mopac-mobility-bridge-loop-360": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Mountain View Trail
  "mountain-view-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Moya-McKinney Falls Trail
  "moya-mckinney-falls-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Nalle Woods Lake Access
  "nalle-woods-lake-access": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Neighborhood Connection Trail
  "neighborhood-connection-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // North Acres Greenbelt Trail
  "north-acres-greenbelt-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // North Austin MUD #1 Greenbelt Trail
  "north-austin-mud-1-greenbelt-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // North Bank Trail
  "north-bank-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // North End Bridge Trail
  "north-end-bridge-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Northern Walnut Creek Trail
  "northern-walnut-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Northshore Trail
  "northshore-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Not Assigned
  "not-assigned": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Oak Grove Trail
  "oak-grove-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Oak Hill Rotary Trail
  "oak-hill-rotary-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Old Bull Creek Road
  "old-bull-creek-road": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Old Growth Trail
  "old-growth-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Old Quarry Trail East
  "old-quarry-trail-east": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Old Violet Crown Trail
  "old-violet-crown-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Greenbelt Pedestrian Walkway 1
  "onion-creek-greenbelt-pedestrian-walkway-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Greenbelt Pedestrian Walkway 2
  "onion-creek-greenbelt-pedestrian-walkway-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Greenbelt Pedestrian Walkway 3
  "onion-creek-greenbelt-pedestrian-walkway-3": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Greenbelt Pedestrian Walkway 4
  "onion-creek-greenbelt-pedestrian-walkway-4": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Greenbelt Trail 1
  "onion-creek-greenbelt-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Greenbelt Trail 3
  "onion-creek-greenbelt-trail-3": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Pedestrian Walkway 1
  "onion-creek-north-pedestrian-walkway-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Pedestrian Walkway 10
  "onion-creek-north-pedestrian-walkway-10": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Pedestrian Walkway 11
  "onion-creek-north-pedestrian-walkway-11": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Pedestrian Walkway 2
  "onion-creek-north-pedestrian-walkway-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Pedestrian Walkway 4
  "onion-creek-north-pedestrian-walkway-4": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Pedestrian Walkway 5
  "onion-creek-north-pedestrian-walkway-5": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Pedestrian Walkway 6
  "onion-creek-north-pedestrian-walkway-6": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Pedestrian Walkway 7
  "onion-creek-north-pedestrian-walkway-7": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Pedestrian Walkway 8
  "onion-creek-north-pedestrian-walkway-8": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Pedestrian Walkway 9
  "onion-creek-north-pedestrian-walkway-9": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Trail 1
  "onion-creek-north-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Trail 2
  "onion-creek-north-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Trail 3
  "onion-creek-north-trail-3": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Trail 4
  "onion-creek-north-trail-4": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Trail 5
  "onion-creek-north-trail-5": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Trail 6
  "onion-creek-north-trail-6": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Trail 7
  "onion-creek-north-trail-7": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Trail 8
  "onion-creek-north-trail-8": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek North Trail 9
  "onion-creek-north-trail-9": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Regional Trail 1
  "onion-creek-regional-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Regional Trail 2
  "onion-creek-regional-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Regional Trail 3
  "onion-creek-regional-trail-3": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Regional Trail 4
  "onion-creek-regional-trail-4": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Regional Trail 5
  "onion-creek-regional-trail-5": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Regional Trail Bridge
  "onion-creek-regional-trail-bridge": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Onion Creek Trail (alt)
  "onion-creek-trail-alt": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Orange Trail
  "orange-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Oro Valley Trail
  "oro-valley-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Outer Log Loop
  "outer-log-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Overlook Trail
  "overlook-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Pansy Trail
  "pansy-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Panther Hollow Trail
  "panther-hollow-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Panther Trail
  "panther-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Path from Kitchen to Parking
  "path-from-kitchen-to-parking": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Path to Annapurna Kitchen
  "path-to-annapurna-kitchen": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Path to Guru Mandir
  "path-to-guru-mandir": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Path to Small Parking Lot
  "path-to-small-parking-lot": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Path to Yajna Shala
  "path-to-yajna-shala": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Pecan Trail
  "pecan-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Perceval Trail
  "perceval-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Percy Springs Trail
  "percy-springs-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Pershing Trail
  "pershing-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Pfluger Bridge
  "pfluger-bridge": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Pipeline Trail
  "pipeline-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Pleasant Valley Rd Trail
  "pleasant-valley-rd-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Pleasant Valley Road Trail
  "pleasant-valley-road-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Point-Six Loop
  "point-six-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Pool Flow Trail
  "pool-flow-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Pool Lot Trail
  "pool-lot-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Porcupine Trail
  "porcupine-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Power Line Trail
  "power-line-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Powerline Flow Trail
  "powerline-flow-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Powerline Hill Trail
  "powerline-hill-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Prairie Crossing Trail
  "prairie-crossing-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Prairie View Trail
  "prairie-view-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Primitive Camp Trail
  "primitive-camp-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Querencia Walking Path
  "querencia-walking-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Querencia Walking Trail
  "querencia-walking-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Railroad Trail
  "railroad-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Rattan Creek Park Trail
  "rattan-creek-park-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Rattlesnack Trail
  "rattlesnack-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Red/Blue Loop
  "red-blue-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Red Line Parkway Trail / Boggy Creek Greenbelt Trail
  "red-line-parkway-trail-boggy-creek-greenbelt-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Red Oak Trail
  "red-oak-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Red Trail
  "red-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Regional Trail
  "regional-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Restoration Research Trail
  "restoration-research-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Rinard Creek Greenbelt Trail
  "rinard-creek-greenbelt-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // River Trail
  "river-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Robinson Park Trail
  "robinson-park-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Rock Bridge Trail
  "rock-bridge-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Root Drop Trail
  "root-drop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Ross Springs Trail
  "ross-springs-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Savanna Meadow Trail
  "savanna-meadow-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Scofield Farms Neighborhood Park Trail
  "scofield-farms-neighborhood-park-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // SE Walnut Creek Trails
  "se-walnut-creek-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Seminary Ridge Access
  "seminary-ridge-access": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Sendero Retention Pond Loop Trail
  "sendero-retention-pond-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Service Road Trail
  "service-road-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Severe Consequences Loop
  "severe-consequences-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // SH45 Shared Use Path
  "sh45-shared-use-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Shady Springs Trail
  "shady-springs-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Shoal Creek Suspension Bridge
  "shoal-creek-suspension-bridge": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Short cut to Goodwater Trail South side
  "short-cut-to-goodwater-trail-south-side": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Short Cut to Goodwater Trail to Tejas
  "short-cut-to-goodwater-trail-to-tejas": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Shortcut Trail
  "shortcut-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // SJN Stations of the Cross Trail
  "sjn-stations-of-the-cross-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Slaughter Creek Trail
  "slaughter-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Slaughter Creek Trail 1
  "slaughter-creek-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Slaughter Creek Trail 2
  "slaughter-creek-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Slaughter Creek Trail 3
  "slaughter-creek-trail-3": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Slaughter Creek Trail 4
  "slaughter-creek-trail-4": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Slaughter Creek Trail Creek Crossing 1
  "slaughter-creek-trail-creek-crossing-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Slaughter Creek Trail Creek Crossing 2
  "slaughter-creek-trail-creek-crossing-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Slaughter Creek Trail Main Loop
  "slaughter-creek-trail-main-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Slaughter Creek Trail Outer Loop
  "slaughter-creek-trail-outer-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // South SE Walnut Creek Trail
  "south-se-walnut-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Southern Walnut Creek Trail
  "southern-walnut-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Stairstep Trail
  "stairstep-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Stations of the Cross Trail
  "stations-of-the-cross-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Steck Valley Greenbelt
  "steck-valley-greenbelt": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Storage Room Foot Path
  "storage-room-foot-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Strand Trail 1
  "strand-trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Strand Trail 2
  "strand-trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Strand Trail Creek Crossing
  "strand-trail-creek-crossing": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Stratford Trail
  "stratford-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Stratford Trail / Mopac-Barton Coridor
  "stratford-trail-mopac-barton-coridor": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Stream Trail
  "stream-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Sunset Trail
  "sunset-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Susie's Meadow Trail
  "susie-s-meadow-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Tangle of Trails Loop
  "tangle-of-trails-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Tangle Wild Trail
  "tangle-wild-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Tar Branch Trail
  "tar-branch-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Taylor Creek Trail
  "taylor-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // The Grove Private Development (PUD)
  "the-grove-private-development-pud": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // The Hollow Lake Loop
  "the-hollow-lake-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Timber Creek Circle
  "timber-creek-circle": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Timber Creek Cove
  "timber-creek-cove": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Timber Creek Drive
  "timber-creek-drive": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Timberwild Trail
  "timberwild-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Top Trail West
  "top-trail-west": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Trail #1
  "trail-1": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Trail 2
  "trail-2": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Trail #3
  "trail-3": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Trail #4
  "trail-4": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Trail #5
  "trail-5": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Trail #6
  "trail-6": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Trail #7
  "trail-7": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Travis Country - Gaines Park Trail
  "travis-country-gaines-park-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Turkey Creek Trail
  "turkey-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Unmarked Trail
  "unmarked-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Unmarked Trail under Latta
  "unmarked-trail-under-latta": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Upland Trail
  "upland-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Upper Island View Trail
  "upper-island-view-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // US 290 Shared Use Path
  "us-290-shared-use-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Via Fortuna Hiking Trail
  "via-fortuna-hiking-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Violet Crown Trail & Arbor Trail Retail Walking Path
  "violet-crown-trail-arbor-trail-retail-walking-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Violet Crown Trail & Oak Hill Rotary Trail
  "violet-crown-trail-oak-hill-rotary-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Violet Crown Trail Spur
  "violet-crown-trail-spur": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Violet Kandy Trail
  "violet-kandy-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Walden Circle Trail Connector
  "walden-circle-trail-connector": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Waller Creek Greenbelt Trail
  "waller-creek-greenbelt-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // West Bouldin Creek Trail
  "west-bouldin-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // West Cliffside Trail
  "west-cliffside-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // West Creek Greenway
  "west-creek-greenway": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // West Fork Walnut Creek
  "west-fork-walnut-creek": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // West Lookout Trail
  "west-lookout-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // West Riverside Trail
  "west-riverside-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Whippoorwill Trail
  "whippoorwill-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Whistling Duck Trail
  "whistling-duck-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Williamson Creek Overlook Trail
  "williamson-creek-overlook-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Williamson Creek Trail
  "williamson-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Windy Loop Trail
  "windy-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Woodland Trail
  "woodland-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Yaupon Trail
  "yaupon-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },
  // Yellow Trail
  "yellow-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Austin City Code § 3-5-3. Dogs allowed in all public parks and trails unless posted otherwise.",
    policySourceUrl: "https://www.austintexas.gov/page/park-rules-and-hours",
    policySourceTitle: "Park Rules & Hours | AustinTexas.gov",
    policyConfidence: 0.72, policyMethod: "manual_seed",
    policyNotes: "City of Austin parks ordinance requires dogs to be on a leash no longer than 6 feet in all public areas. Designated off-leash areas (DOLAs) are posted separately; this trail is not a designated DOLA.",
  },

  // ── ROUND ROCK (dogs allowed, leash required) ───────────────────────────
  // Abrantes Walking Trail
  "abrantes-walking-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Bowman Park Trail
  "bowman-park-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Bradford Park Path
  "bradford-park-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Brookholllow Trail
  "brookholllow-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Brookhollow Trail
  "brookhollow-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Brushy Creek Regional Trail
  "brushy-creek-regional-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Brushy Creek Regional Trail North Fork
  "brushy-creek-regional-trail-north-fork": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Brushy Creek Trail
  "brushy-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Brushy Creek Trail East
  "brushy-creek-trail-east": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Firehouse to Red Horn Trail
  "firehouse-to-red-horn-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Gilleland Creek Trail West
  "gilleland-creek-trail-west": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Heritage Loop Trail
  "heritage-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Heritage Trail
  "heritage-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Horseshoe Loop
  "horseshoe-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Jeep Trail
  "jeep-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Jim Rodgers Trail
  "jim-rodgers-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Lake Creek Loop Trail
  "lake-creek-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Lake Creek Trail
  "lake-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Lariat Loop
  "lariat-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // North Brushy Creek Trail
  "north-brushy-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Oak Brook Trail
  "oak-brook-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Pfluger Park Loop
  "pfluger-park-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Pond Springs Creek Trail
  "pond-springs-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Quarter Notch Above Walnut Creek
  "quarter-notch-above-walnut-creek": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Red Horn to Katy Ln Trail (Walsh Trails)
  "red-horn-to-katy-ln-trail-walsh-trails": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Red Line Trail - Avery Ranch Blvd to Hattery Lane
  "red-line-trail-avery-ranch-blvd-to-hattery-lane": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Red Line Trail - Fletcher Hall Lane to Shallow Water Road
  "red-line-trail-fletcher-hall-lane-to-shallow-water-road": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Red Line Trail - Shallow Water Road
  "red-line-trail-shallow-water-road": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Red Line Trail - Shallow Water Road to Comancheros Road
  "red-line-trail-shallow-water-road-to-comancheros-road": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Southern Cross Pond Trail
  "southern-cross-pond-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Swenson Farms Boulevard Trail
  "swenson-farms-boulevard-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Trails of Shady Oaks Trail
  "trails-of-shady-oaks-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Twin Ridge Walking Path
  "twin-ridge-walking-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Round Rock City Code. Dogs allowed in all city parks and trails.",
    policySourceUrl: "https://www.roundrocktexas.gov/departments/parks-and-recreation/parks/",
    policySourceTitle: "Parks & Recreation | Round Rock, TX",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },

  // ── CEDAR PARK (dogs allowed, leash required) ───────────────────────────
  // 183A Shared Use Path
  "183a-shared-use-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Blue Loop
  "blue-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Blue Loop (In The Rough)
  "blue-loop-in-the-rough": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Blue Loop (Three Oaks)
  "blue-loop-three-oaks": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Buttercup Creek Preserve Trail
  "buttercup-creek-preserve-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Cedar Elm Preserve Trail
  "cedar-elm-preserve-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Cross Creek Trail
  "cross-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Gann Ranch Walking Trail
  "gann-ranch-walking-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Godzilla Preserve Trail
  "godzilla-preserve-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Red Loop
  "red-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // The Rim Loop
  "the-rim-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Whitestone Preserve Trail
  "whitestone-preserve-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Cedar Park city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cedarparktexas.gov/Parks",
    policySourceTitle: "Parks & Recreation | Cedar Park, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },

  // ── GEORGETOWN (dogs allowed, leash required) ───────────────────────────
  // AirBorn Walking Path
  "airborn-walking-path": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Berry Creek Trail
  "berry-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Chataqua Trail
  "chataqua-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Dam to Lake Overlook Road
  "dam-to-lake-overlook-road": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Discovery Trail
  "discovery-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Dry Creek Trail
  "dry-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Legacy Lake
  "legacy-lake": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Meadow Loop Spur
  "meadow-loop-spur": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Meadow Loop Trail
  "meadow-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Mill Pond Loop Trail
  "mill-pond-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Path from Dam to Overlook
  "path-from-dam-to-overlook": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Peacon Grove Loop trail
  "peacon-grove-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Pickett Trail
  "pickett-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Prairie Trail
  "prairie-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // River Loop
  "river-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Rocky Creek
  "rocky-creek": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // San Gabriel Regional Trail
  "san-gabriel-regional-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // San Gabriel River Trail
  "san-gabriel-river-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // South San Gabriel River Trail
  "south-san-gabriel-river-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Spring Loop Trail
  "spring-loop-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // Susan Blackedge Nature Trail
  "susan-blackedge-nature-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },
  // West Creek
  "west-creek": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Georgetown city parks rules. Dogs allowed on all city and county trail systems.",
    policySourceUrl: "https://parks.georgetown.org/trails-greenways/",
    policySourceTitle: "Trails & Greenways | Georgetown Parks & Recreation",
    policyConfidence: 0.75, policyMethod: "manual_seed",
  },

  // ── PFLUGERVILLE (dogs allowed, leash required) ───────────────────────────
  // Copperfield Nature Trail
  "copperfield-nature-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Pflugerville city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.pflugervilletx.gov/parks-recreation",
    policySourceTitle: "Parks & Recreation | Pflugerville, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Gilleland Creek Trail
  "gilleland-creek-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Pflugerville city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.pflugervilletx.gov/parks-recreation",
    policySourceTitle: "Parks & Recreation | Pflugerville, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Parking lot access to Pflugerville Hike and Bike Trail
  "parking-lot-access-to-pflugerville-hike-and-bike-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Pflugerville city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.pflugervilletx.gov/parks-recreation",
    policySourceTitle: "Parks & Recreation | Pflugerville, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Pfairways Trail
  "pfairways-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Pflugerville city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.pflugervilletx.gov/parks-recreation",
    policySourceTitle: "Parks & Recreation | Pflugerville, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Pflugerville Hike and Bike Trail
  "pflugerville-hike-and-bike-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Pflugerville city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.pflugervilletx.gov/parks-recreation",
    policySourceTitle: "Parks & Recreation | Pflugerville, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },

  // ── LEANDER (dogs allowed, leash required) ───────────────────────────
  // Cedar Ridge Trail
  "cedar-ridge-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Leander city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.leandertx.gov/parks",
    policySourceTitle: "Parks | Leander, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Highlands Loop
  "highlands-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Leander city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.leandertx.gov/parks",
    policySourceTitle: "Parks | Leander, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Meadow Loop
  "meadow-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Leander city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.leandertx.gov/parks",
    policySourceTitle: "Parks | Leander, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Nature Trail
  "nature-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Leander city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.leandertx.gov/parks",
    policySourceTitle: "Parks | Leander, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Saddle Loop
  "saddle-loop": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Leander city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.leandertx.gov/parks",
    policySourceTitle: "Parks | Leander, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Side Oats Trail
  "side-oats-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Leander city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.leandertx.gov/parks",
    policySourceTitle: "Parks | Leander, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },

  // ── KYLE (dogs allowed, leash required) ───────────────────────────
  // Armadillo Trail
  "armadillo-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Kyle city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cityofkyle.com/parks",
    policySourceTitle: "Parks | City of Kyle, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Cicada Trail
  "cicada-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Kyle city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cityofkyle.com/parks",
    policySourceTitle: "Parks | City of Kyle, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Post Oak Trail
  "post-oak-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Kyle city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cityofkyle.com/parks",
    policySourceTitle: "Parks | City of Kyle, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Prickly Pear Trail (ADA)
  "prickly-pear-trail-ada": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Kyle city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cityofkyle.com/parks",
    policySourceTitle: "Parks | City of Kyle, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },

  // ── LAKEWAY (dogs allowed, leash required) ───────────────────────────
  // Bright Sky Overlook Trail
  "bright-sky-overlook-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Lakeway city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.lakeway-tx.gov/parks",
    policySourceTitle: "Parks | Lakeway, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Lakewood Hills Trail
  "lakewood-hills-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Lakeway city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.lakeway-tx.gov/parks",
    policySourceTitle: "Parks | Lakeway, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Lariat Trail
  "lariat-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Lakeway city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.lakeway-tx.gov/parks",
    policySourceTitle: "Parks | Lakeway, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // River Heights Overlook Trail, Yo!
  "river-heights-overlook-trail-yo": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Lakeway city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.lakeway-tx.gov/parks",
    policySourceTitle: "Parks | Lakeway, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // Summer Vista Trail
  "summer-vista-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Lakeway city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.lakeway-tx.gov/parks",
    policySourceTitle: "Parks | Lakeway, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },
  // West Ridge Canyon Trail
  "west-ridge-canyon-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Lakeway city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.lakeway-tx.gov/parks",
    policySourceTitle: "Parks | Lakeway, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },

  // ── BUDA (dogs allowed, leash required) ───────────────────────────
  // Amberwood Walking Trail
  "amberwood-walking-trail": {
    dogsAllowed: "allowed", leashPolicy: "required",
    leashDetails: "Leash required at all times per Buda city parks rules. Dogs allowed on all city trails.",
    policySourceUrl: "https://www.cityofbuda.org/parks",
    policySourceTitle: "Parks | City of Buda, TX",
    policyConfidence: 0.73, policyMethod: "manual_seed",
  },

};
