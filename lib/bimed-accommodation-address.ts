export const BIMED_POPE_QUAY_BASE_ADDRESS = "19 Pope’s Quay, Cork, T23 PXV5, Ireland";

export const BIMED_POPE_QUAY_FLATS = [
  "Flat 1",
  "Flat 2",
  "Flat 3",
  "Flat 4",
  "Flat 5",
  "Flat 6",
  "Flat 7",
  "Flat 8",
] as const;

export type BimedAccommodationUnit = (typeof BIMED_POPE_QUAY_FLATS)[number] | "Other";

export function isBimedAccommodationUnit(value: unknown): value is BimedAccommodationUnit {
  return value === "Other" || BIMED_POPE_QUAY_FLATS.some((flat) => flat === value);
}

export function formatBimedPopeQuayAddress(unit: unknown): string | null {
  if (typeof unit !== "string" || !BIMED_POPE_QUAY_FLATS.some((flat) => flat === unit)) {
    return null;
  }
  return unit + ", " + BIMED_POPE_QUAY_BASE_ADDRESS;
}

export function defaultBimedWorkAddress(bimedId: string | null | undefined): string {
  return bimedId === "BH-001017" || bimedId === "BH-001042"
    ? "Sarsfields Court, Co. Cork, T23 K260, Ireland"
    : "";
}

export function defaultBimedAccommodationUnit(bimedId: string | null | undefined): BimedAccommodationUnit | "" {
  return bimedId === "BH-001017" || bimedId === "BH-001042" ? "Flat 1" : "";
}

export function defaultSharedAccommodationPartner(bimedId: string | null | undefined): string {
  if (bimedId === "BH-001017") return "BH-001042";
  if (bimedId === "BH-001042") return "BH-001017";
  return "";
}
