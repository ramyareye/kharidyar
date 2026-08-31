import { describe, expect, it } from "vitest";

import {
  euroInputFromMinor,
  movePaletteColor,
  normalizedPaletteHasDuplicates,
  parseEuroAmount,
  splitStructuredList,
  splitStructuredLines,
} from "./collection-direction-state";

describe("Collection direction form state", () => {
  it("parses EUR input without floating-point conversion", () => {
    expect(parseEuroAmount("")).toEqual({ minor: null, valid: true });
    expect(parseEuroAmount("2150")).toEqual({ minor: 215_000, valid: true });
    expect(parseEuroAmount("29,99")).toEqual({ minor: 2_999, valid: true });
    expect(parseEuroAmount("12.345").valid).toBe(false);
    expect(euroInputFromMinor(215_000)).toBe("2150");
    expect(euroInputFromMinor(2_999)).toBe("29.99");
  });

  it("preserves intentional list and palette order", () => {
    expect(splitStructuredList("oak, linen\nPaper light")).toEqual([
      "oak",
      "linen",
      "Paper light",
    ]);
    expect(
      splitStructuredLines(
        "https://example.com/path,with-comma\n https://example.org/ ",
      ),
    ).toEqual([
      "https://example.com/path,with-comma",
      "https://example.org/",
    ]);
    expect(movePaletteColor(["oak", "paper", "moss"], 2, -1)).toEqual([
      "oak",
      "moss",
      "paper",
    ]);
    expect(movePaletteColor(["oak"], 0, -1)).toEqual(["oak"]);
  });

  it("detects normalized duplicates across both palette groups", () => {
    expect(
      normalizedPaletteHasDuplicates(
        [{ hex: "#abcdef", label: null, usageNote: null }],
        [{ hex: "#ABCDEF", label: "Duplicate", usageNote: null }],
      ),
    ).toBe(true);
  });
});
