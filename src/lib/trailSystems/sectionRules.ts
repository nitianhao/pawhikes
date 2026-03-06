export type SectionRule = {
  id: string;
  title: string;
  explicitKeys?: string[];
  prefixes?: string[];
  nestedPaths?: string[];
};

export const SECTION_RULES: SectionRule[] = [
  {
    id: "basics",
    title: "Basics",
    explicitKeys: [],
    prefixes: ["ext"],
  },
  {
    id: "dog",
    title: "Dog personalization",
    prefixes: ["personalization"],
    nestedPaths: [
      "personalization.smallDogScore",
      "personalization.seniorSafeScore",
      "personalization.highEnergyScore",
      "personalization.heatSensitiveLevel",
      "personalization.reasons",
    ],
  },
  {
    id: "access",
    title: "Access & rules",
    prefixes: ["access", "rules", "policy"],
    explicitKeys: ["accessRulesClass", "accessRulesReasons", "accessPoints"],
  },
  {
    id: "amenities",
    title: "Amenities",
    prefixes: ["amenit", "parking", "restroom", "trash", "waterFountain"],
  },
  {
    id: "surface",
    title: "Surface",
    prefixes: ["surface", "asphalt", "paved", "naturalSurface", "width", "tracktype"],
  },
  { id: "shade", title: "Shade", prefixes: ["shade"] },
  { id: "water", title: "Water", prefixes: ["water", "swim"] },
  { id: "elevation", title: "Elevation & grade", prefixes: ["elevation", "grade", "slope"] },
  {
    id: "hazards",
    title: "Hazards",
    explicitKeys: [
      "hazardPoints",
      "hazards",
      "hazardsClass",
      "hazardsLastComputedAt",
      "hazardsReasons",
      "hazardsScore",
    ],
  },
  { id: "nightWinter", title: "Night & winter", prefixes: ["night", "winter"] },
];

