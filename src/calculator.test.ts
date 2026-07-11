import { describe, expect, it } from "vitest";
import { calculateEstimate } from "./calculator";
import type { CalculatorInput } from "./types";

const baseInput: CalculatorInput = {
  hospitalId: "UH",
  room: "標準房",
  delivery: "elective",
  timing: "standard",
  packageMode: "standard",
  stayDays: 5,
  babyCount: 1,
  extraMotherNights: 0,
  extraBabyNights: 0,
  jaundiceReserve: false,
  contingencyPercent: 10,
  professionalQuote: {}
};

describe("maternity cost calculator", () => {
  it("calculates Union Hospital package, room and professional fees separately", () => {
    const result = calculateEstimate(baseInput);

    expect(result.selectedPackage?.price).toBe(26000);
    expect(result.hospitalSubtotal.base).toBe(29900);
    expect(result.professionalSubtotal.base).toBe(55000);
    expect(result.breakdown.some((item) => item.id === "room")).toBe(true);
    expect(result.base).toBe(93390);
  });

  it("uses the Union Hospital private-room +75% profile", () => {
    const result = calculateEstimate({ ...baseInput, room: "私家房" });

    expect(result.professionalSubtotal.base).toBe(96250);
    expect(result.selectedPackage?.price).toBe(44800);
    expect(result.high).toBeGreaterThan(result.base);
  });

  it("does not add a second multifetal surcharge to the dedicated twin package", () => {
    const result = calculateEstimate({ ...baseInput, babyCount: 2 });

    expect(result.selectedPackage?.specialTwin).toBe(true);
    expect(result.selectedPackage?.price).toBe(35000);
    expect(result.breakdown.some((item) => item.id === "multifetal")).toBe(false);
  });

  it("keeps professional fees at zero for Matilda Total Care", () => {
    const result = calculateEstimate({
      ...baseInput,
      hospitalId: "MIH",
      room: "Standard Room",
      packageMode: "total_care"
    });

    expect(result.selectedPackage?.packageMode).toBe("total_care");
    expect(result.professionalSubtotal.base).toBe(0);
  });

  it("adds the official CUHKMC direct emergency surcharge without using the after-labour package", () => {
    const result = calculateEstimate({
      ...baseInput,
      hospitalId: "CUHKMC",
      room: "二人房",
      delivery: "direct_emergency"
    });

    expect(result.selectedPackage?.delivery).toBe("elective");
    expect(result.breakdown.find((item) => item.id === "emergency")?.base).toBe(4600);
  });

  it("shows a secondary-source warning for Canossa package prices", () => {
    const result = calculateEstimate({
      ...baseInput,
      hospitalId: "CH",
      room: "標準房"
    });

    expect(result.selectedPackage?.sourceType).toBe("secondary");
    expect(result.warnings.some((warning) => warning.includes("保險公司價格快照"))).toBe(true);
    expect(result.confidence).toBe("low");
  });

  it("lets a user quote override the estimated obstetrician fee", () => {
    const result = calculateEstimate({
      ...baseInput,
      professionalQuote: { obstetrician: 28000 }
    });
    const item = result.breakdown.find((row) => row.id === "professional-obstetrician");

    expect(item?.base).toBe(28000);
    expect(item?.source).toBe("user");
  });
});
