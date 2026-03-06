export type HighlightRaw = {
  kind: string;
  name: string | null;
  tags: Record<string, string>;
  osmId: string;
  osmType: "node" | "way" | "relation";
  location: { type: "Point"; coordinates: [number, number] };
  distanceToTrailMeters: number;
};

export type Highlight = {
  id: string;
  kind: string;
  title: string;
  typeLabel: string | null;
  categoryLabel: string;
  iconKey: string;
  distanceM: number;
  distanceShort: string;
  distanceLong: string;
  distanceBand: "on-trail" | "very-close" | "close" | "nearby" | "off-route";
  lat: number;
  lng: number;
  osmType: "node" | "way" | "relation";
  osmIdRaw: string;
  osmNumericId: string | null;
  osmUrl: string | null;
  tags: Record<string, string>;
  raw: HighlightRaw;
  isIncomplete: boolean;
};
