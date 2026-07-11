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
  epidural: false,
  instrumentalDelivery: false,
  babyScreeningFee: 0,
  professionalSurchargePercent: 50,
  professionalQuote: {}
};

describe("maternity cost calculator", () => {
  it("calculates Union Hospital package, room and professional fees separately", () => {
    const result = calculateEstimate(baseInput);

    expect(result.selectedPackage?.price).toBe(26000);
    expect(result.hospitalSubtotal.base).toBe(29900);
    expect(result.professionalSubtotal.base).toBe(45000);
    expect(result.babySubtotal.base).toBe(10000);
    expect(result.breakdown.some((item) => item.id === "room")).toBe(true);
    expect(result.base).toBe(84900);
  });

  it("uses the Union Hospital private-room +75% profile", () => {
    const result = calculateEstimate({ ...baseInput, room: "私家房" });

    expect(result.professionalSubtotal.base).toBe(78750);
    expect(result.babySubtotal.base).toBe(17500);
    expect(result.selectedPackage?.price).toBe(44800);
    expect(result.high).toBe(result.base);
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

  it("calculates a natural delivery without anaesthetist fees when epidural is not selected", () => {
    const result = calculateEstimate({
      ...baseInput,
      delivery: "natural",
      stayDays: 4
    });

    expect(result.selectedPackage?.delivery).toBe("natural");
    expect(result.selectedPackage?.price).toBe(22500);
    expect(result.breakdown.some((item) => item.id === "professional-anaesthetist")).toBe(false);
    expect(result.base).toBe(67620);
  });

  it("places paediatric rounds and extra screening in the BB subtotal", () => {
    const result = calculateEstimate({
      ...baseInput,
      babyScreeningFee: 2500
    });

    expect(result.babySubtotal.base).toBe(12500);
    expect(result.breakdown.find((item) => item.id === "professional-paediatrician")?.kind).toBe(
      "baby"
    );
    expect(result.breakdown.find((item) => item.id === "baby-extra-screening")?.base).toBe(2500);
  });

  it("defaults to a 50% obstetrician and anaesthetist surcharge for off-hours", () => {
    const result = calculateEstimate({
      ...baseInput,
      timing: "off_hours"
    });
    const surcharge = result.breakdown.find(
      (item) => item.id === "professional-off-hours-surcharge"
    );

    expect(surcharge?.base).toBe(20000);
    expect(result.professionalSubtotal.base).toBe(65000);
    expect(result.base).toBe(127900);
  });

  it("lets the user change the professional off-hours surcharge percentage", () => {
    const result = calculateEstimate({
      ...baseInput,
      timing: "off_hours",
      professionalSurchargePercent: 25
    });
    const surcharge = result.breakdown.find(
      (item) => item.id === "professional-off-hours-surcharge"
    );

    expect(surcharge?.base).toBe(10000);
    expect(result.professionalSubtotal.base).toBe(55000);
  });

  it("does not add a professional off-hours surcharge to Matilda Total Care", () => {
    const result = calculateEstimate({
      ...baseInput,
      hospitalId: "MIH",
      room: "Standard Room",
      packageMode: "total_care",
      timing: "off_hours"
    });

    expect(result.selectedPackage?.professionalIncluded).toBe(true);
    expect(
      result.breakdown.some((item) => item.id === "professional-off-hours-surcharge")
    ).toBe(false);
  });
});
