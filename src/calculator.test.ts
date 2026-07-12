import { describe, expect, it } from "vitest";
import { calculateEstimate } from "./calculator";
import { database } from "./data";
import type { CalculatorInput } from "./types";

const baseInput: CalculatorInput = {
  hospitalId: "UH",
  room: "標準房",
  delivery: "elective",
  timing: "standard",
  packageMode: "standard",
  accommodationDays: 5,
  obstetricianRounds: 5,
  paediatricianRounds: 5,
  babyCount: 1,
  extraMotherNights: 0,
  extraBabyNights: 0,
  epidural: false,
  instrumentalDelivery: false,
  babyScreeningPlanId: "none",
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
      accommodationDays: 4,
      obstetricianRounds: 4,
      paediatricianRounds: 4
    });

    expect(result.selectedPackage?.delivery).toBe("natural");
    expect(result.selectedPackage?.price).toBe(22500);
    expect(result.breakdown.some((item) => item.id === "professional-anaesthetist")).toBe(false);
    expect(result.base).toBe(67620);
  });

  it("places paediatric rounds and extra screening in the BB subtotal", () => {
    const result = calculateEstimate({
      ...baseInput,
      babyScreeningPlanId: "manual",
      babyScreeningFee: 2500
    });

    expect(result.babySubtotal.base).toBe(12500);
    expect(result.breakdown.find((item) => item.id === "professional-paediatrician")?.kind).toBe(
      "baby"
    );
    expect(result.breakdown.find((item) => item.id === "baby-extra-screening")?.base).toBe(2500);
  });

  it("keeps the government newborn screening reference at zero cost", () => {
    const result = calculateEstimate({
      ...baseInput,
      babyScreeningPlanId: "ha-private-pilot"
    });
    const screening = result.breakdown.find((item) => item.id === "baby-extra-screening");

    expect(screening?.base).toBe(0);
    expect(screening?.source).toBe("verified");
    expect(result.babySubtotal.base).toBe(10000);
    expect(result.sources.some((source) => source.url.includes("info.gov.hk"))).toBe(true);
  });

  it("adds the CUHK secondary screening reference to the BB subtotal", () => {
    const result = calculateEstimate({
      ...baseInput,
      babyScreeningPlanId: "cuhk-private",
      babyScreeningFee: 1300
    });
    const screening = result.breakdown.find((item) => item.id === "baby-extra-screening");

    expect(screening?.base).toBe(1300);
    expect(screening?.source).toBe("secondary");
    expect(result.babySubtotal.base).toBe(11300);
  });

  it("shows HKBGI NOVA as an unpriced reference without changing the total", () => {
    const result = calculateEstimate({
      ...baseInput,
      babyScreeningPlanId: "hkbgi-nova"
    });
    const screening = result.breakdown.find((item) => item.id === "baby-extra-screening");

    expect(screening?.base).toBe(0);
    expect(screening?.source).toBe("secondary");
    expect(result.babySubtotal.base).toBe(10000);
    expect(result.warnings.some((warning) => warning.includes("華大NOVA"))).toBe(true);
  });

  it("defaults to a 50% obstetrician and anaesthetist surcharge for off-hours", () => {
    const result = calculateEstimate({
      ...baseInput,
      timing: "off_hours"
    });
    const surcharge = result.breakdown.find(
      (item) => item.id === "professional-extra-surcharge"
    );

    expect(surcharge?.base).toBe(20000);
    expect(surcharge?.label).toBe("夜間／假日專業費附加");
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
      (item) => item.id === "professional-extra-surcharge"
    );

    expect(surcharge?.base).toBe(10000);
    expect(result.professionalSubtotal.base).toBe(55000);
  });

  it("applies the professional surcharge to emergency c-sections", () => {
    const result = calculateEstimate({
      ...baseInput,
      delivery: "direct_emergency"
    });
    const surcharge = result.breakdown.find(
      (item) => item.id === "professional-extra-surcharge"
    );

    expect(surcharge?.label).toBe("緊急剖腹專業費附加");
    expect(surcharge?.base).toBe(20000);
    expect(result.professionalSubtotal.base).toBe(65000);
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
      result.breakdown.some((item) => item.id === "professional-extra-surcharge")
    ).toBe(false);
  });

  it("intentionally exposes one central estimate in low, base and high", () => {
    const result = calculateEstimate(baseInput);
    expect(result.low).toBe(result.base);
    expect(result.high).toBe(result.base);
  });

  it("keeps accommodation and both round counts independent", () => {
    const result = calculateEstimate({
      ...baseInput,
      accommodationDays: 7,
      obstetricianRounds: 2,
      paediatricianRounds: 3
    });
    expect(result.breakdown.find((item) => item.id === "professional-obRound")?.base).toBe(2000);
    expect(result.breakdown.find((item) => item.id === "professional-paediatrician")?.base).toBe(6000);
    expect(result.breakdown.find((item) => item.id === "room")?.detail).toContain("5 日");
  });

  it("uses a natural-delivery professional profile instead of a caesarean profile", () => {
    const result = calculateEstimate({ ...baseInput, delivery: "natural" });
    expect(result.warnings.some((warning) => warning.includes("自然分娩使用獨立接生費Profile"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("剖腹Profile"))).toBe(false);
  });

  it("explains controlled fallback for an emergency scenario", () => {
    const result = calculateEstimate({ ...baseInput, delivery: "direct_emergency" });
    expect(result.selectedPackage?.delivery).toBe("elective");
    expect(result.packageFallbackReason).toContain("沒有獨立套餐");
    expect(result.warnings.some((warning) => warning.startsWith("套餐Fallback："))).toBe(true);
  });

  it("prices an extra BB stay from the selected room-class column", () => {
    const fee = database.feeItems.find((item) => item.id === "CH-NURSERY-DAILY")!;
    const original = { standard: fee.standard, semiPrivate: fee.semiPrivate, private: fee.private };
    Object.assign(fee, { standard: 1000, semiPrivate: 1600, private: 2400 });
    try {
      const result = calculateEstimate({
        ...baseInput,
        hospitalId: "CH",
        room: "私家房",
        extraBabyNights: 2
      });
      expect(result.breakdown.find((item) => item.id === "extra-baby-night")?.base).toBe(4800);
    } finally {
      Object.assign(fee, original);
    }
  });

  it("handles triplets through the published multifetal rule", () => {
    const result = calculateEstimate({ ...baseInput, babyCount: 3 });
    expect(result.breakdown.find((item) => item.id === "multifetal")?.base).toBe(18200);
  });

  it("shows package price and the outside-package bill gap", () => {
    const result = calculateEstimate(baseInput);
    expect(result.packagePrice).toBe(26000);
    expect(result.outsidePackageTotal).toBe(result.base - result.packagePrice);
    expect(result.estimatedBillGap).toBe(result.outsidePackageTotal);
  });
});
