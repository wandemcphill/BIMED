import { describe, expect, it } from "vitest";
import {
  BIMED_POPE_QUAY_BASE_ADDRESS,
  BIMED_POPE_QUAY_FLATS,
  defaultBimedAccommodationUnit,
  defaultBimedWorkAddress,
  defaultSharedAccommodationPartner,
  formatBimedPopeQuayAddress,
  isBimedAccommodationUnit,
} from "@/lib/bimed-accommodation-address";

describe("BIMED candidate-specific contract addresses", () => {
  it("formats all eight Pope's Quay flats with the supplied Irish property address", () => {
    expect(BIMED_POPE_QUAY_FLATS).toHaveLength(8);
    expect(formatBimedPopeQuayAddress("Flat 1")).toBe(
      "Flat 1, 19 Pope’s Quay, Cork, T23 PXV5, Ireland"
    );
    expect(formatBimedPopeQuayAddress("Flat 8")).toBe(
      "Flat 8, 19 Pope’s Quay, Cork, T23 PXV5, Ireland"
    );
    expect(BIMED_POPE_QUAY_BASE_ADDRESS).toBe(
      "19 Pope’s Quay, Cork, T23 PXV5, Ireland"
    );
  });

  it("does not treat arbitrary units as one of the shared property's known flats", () => {
    expect(isBimedAccommodationUnit("Flat 4")).toBe(true);
    expect(isBimedAccommodationUnit("Other")).toBe(true);
    expect(isBimedAccommodationUnit("Flat 9")).toBe(false);
    expect(formatBimedPopeQuayAddress("Flat 9")).toBeNull();
  });

  it("prefills only the two confirmed physiotherapists' supplied work and shared accommodation details", () => {
    expect(defaultBimedWorkAddress("BH-001017")).toBe(
      "Sarsfields Court, Co. Cork, T23 K260, Ireland"
    );
    expect(defaultBimedWorkAddress("BH-001042")).toBe(
      "Sarsfields Court, Co. Cork, T23 K260, Ireland"
    );
    expect(defaultBimedAccommodationUnit("BH-001017")).toBe("Flat 1");
    expect(defaultBimedAccommodationUnit("BH-001042")).toBe("Flat 1");
    expect(defaultSharedAccommodationPartner("BH-001017")).toBe("BH-001042");
    expect(defaultSharedAccommodationPartner("BH-001042")).toBe("BH-001017");
    expect(defaultBimedWorkAddress("BH-001100")).toBe("");
    expect(defaultBimedAccommodationUnit("BH-001100")).toBe("");
    expect(defaultSharedAccommodationPartner("BH-001100")).toBe("");
  });
});
