import { describe, expect, it } from "vitest";
import { buildShareUrl, compareHospitals, compareRoomClasses, defaultInput, inputFromUrl } from "./features";

describe("comparison and sharing features", () => {
  it("compares hospitals with one central estimate each", () => {
    const rows = compareHospitals(defaultInput);
    expect(rows.length).toBeGreaterThan(5);
    rows.forEach(({ result }) => expect(result.low).toBe(result.high));
  });

  it("compares standard and private rooms when both exist", () => {
    const rows = compareRoomClasses(defaultInput);
    expect(rows.map((row) => row.roomClass)).toEqual(["standard", "private"]);
    expect(rows[1].result.base).toBeGreaterThan(rows[0].result.base);
  });

  it("shares general conditions without professional quotes", () => {
    const url = buildShareUrl(
      { ...defaultInput, professionalQuote: { obstetrician: 88888, anaesthetist: 22222 } },
      "https://example.com"
    );
    expect(url).not.toContain("88888");
    expect(url).not.toContain("22222");
    expect(url).toContain("hospital=UH");
  });

  it("restores safe conditions and ignores quote-like unknown parameters", () => {
    const restored = inputFromUrl({ pathname: "/hk-hospital-calc/", search: "?hospital=UH&room=%E7%A7%81%E5%AE%B6%E6%88%BF&days=7&obstetrician=99999" } as Location);
    expect(restored.room).toBe("私家房");
    expect(restored.accommodationDays).toBe(7);
    expect(restored.professionalQuote).toEqual({});
  });

  it("keeps calculator defaults when optional URL values are absent", () => {
    const restored = inputFromUrl({ pathname: "/hk-hospital-calc/", search: "" } as Location);
    expect(restored.accommodationDays).toBe(5);
    expect(restored.obstetricianRounds).toBe(5);
    expect(restored.paediatricianRounds).toBe(5);
  });
});
