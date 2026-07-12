import { database, getHospital } from "./data";
import { getBabyScreeningReference } from "./screeningReferences";
import type {
  BreakdownItem,
  CalculatorInput,
  CalculatorResult,
  Confidence,
  EstimateBand,
  MaternityPackage,
  ProfessionalEstimate,
  Surcharge
} from "./types";

const zeroBand = (): EstimateBand => ({ low: 0, base: 0, high: 0 });
const addBand = (a: EstimateBand, b: EstimateBand): EstimateBand => ({
  low: a.low + b.low,
  base: a.base + b.base,
  high: a.high + b.high
});
const roundMoney = (value: number) => Math.round(value / 10) * 10;
const moneyLike = (value: number) => `HK$${Math.round(value).toLocaleString("en-US")}`;

function isEmergencyCSection(input: CalculatorInput) {
  return input.delivery === "direct_emergency" || input.delivery === "after_labor";
}

function classifyRoom(room: string): "standard" | "semi" | "private" {
  if (/私家|套房|Private/i.test(room) && !/半私家/.test(room)) return "private";
  if (/半私家|雙人房|Twin|一人房|Single/i.test(room) && !/標準/.test(room)) {
    return "semi";
  }
  return "standard";
}

export function selectPackageMatch(input: CalculatorInput): {
  package: MaternityPackage | null;
  fallbackReason: string | null;
} {
  const sameRoom = database.packages.filter(
    (item) => item.hospitalId === input.hospitalId && item.room === input.room
  );
  if (!sameRoom.length) return { package: null, fallbackReason: "此醫院及房型沒有套餐資料。" };

  const wantsTwinPackage = input.babyCount === 2;
  const exact = sameRoom.filter(
    (item) =>
      item.delivery === input.delivery &&
      item.timing === input.timing &&
      item.packageMode === input.packageMode &&
      item.specialTwin === wantsTwinPackage
  );
  if (exact.length) {
    return {
      package: [...exact].sort(
        (a, b) =>
          Math.abs((a.packageDays ?? input.accommodationDays) - input.accommodationDays) -
          Math.abs((b.packageDays ?? input.accommodationDays) - input.accommodationDays)
      )[0],
      fallbackReason: null
    };
  }

  // Natural delivery must never fall back to a caesarean package.
  const deliveryFallback = input.delivery === "natural" ? "natural" : "elective";
  const relaxed = sameRoom.filter(
    (item) =>
      item.delivery === deliveryFallback &&
      item.packageMode === input.packageMode &&
      item.specialTwin === wantsTwinPackage
  );
  const singleFallback = !relaxed.length && wantsTwinPackage
    ? sameRoom.filter(
        (item) =>
          item.delivery === deliveryFallback &&
          item.packageMode === input.packageMode &&
          !item.specialTwin
      )
    : relaxed;
  const selected = singleFallback.find((item) => item.timing === "standard") ?? singleFallback[0] ?? null;
  if (!selected) {
    return { package: null, fallbackReason: "找不到相同分娩方式、套餐類型及胎數的可用套餐。" };
  }
  const reasons = [];
  if (selected.delivery !== input.delivery) reasons.push("所選緊急情境沒有獨立套餐，暫用預約剖腹套餐");
  if (selected.timing !== input.timing) reasons.push("所選時段沒有獨立套餐，暫用正常時段套餐並另計附加費");
  if (wantsTwinPackage && !selected.specialTwin) reasons.push("沒有雙胎專屬套餐，暫用單胎套餐及多胎附加規則");
  return { package: selected, fallbackReason: reasons.join("；") + "。" };
}

export function selectPackage(input: CalculatorInput): MaternityPackage | null {
  return selectPackageMatch(input).package;
}

function roomIndex(hospitalId: string, room: string) {
  const order: Record<string, string[]> = {
    SPH: ["標準房（4人）", "雙人房", "私家房"],
    GHK: ["標準房（兩床）", "半私家單人房", "私家單人房", "家庭套房"],
    CUHKMC: ["二人房", "一人房"]
  };
  return Math.max(0, order[hospitalId]?.indexOf(room) ?? 0);
}

function parseAmount(raw: Surcharge["amountRaw"], hospitalId: string, room: string) {
  if (typeof raw === "number") return raw;
  if (!raw || /未公開|查詢/.test(String(raw))) return null;
  const values = String(raw)
    .split(/[／/]/)
    .map((value) => Number(value.replace(/[^0-9.]/g, "")))
    .filter(Number.isFinite);
  return values[roomIndex(hospitalId, room)] ?? values[0] ?? null;
}

function timingSurcharge(input: CalculatorInput, selected: MaternityPackage) {
  if (input.timing === "standard" || selected.timing === input.timing) {
    return { band: zeroBand(), rows: [] as Surcharge[] };
  }

  const rows = database.surcharges.filter((row) => {
    if (row.hospitalId !== input.hospitalId) return false;
    if (input.timing === "specified") {
      return /指定時段|指定時辰/.test(row.name) && !/時段二|時段三|非辦公/.test(row.name);
    }
    return /非辦公|非手術室|時段二|時段三/.test(row.name);
  });

  const amounts = rows
    .map((row) => parseAmount(row.amountRaw, input.hospitalId, input.room))
    .filter((value): value is number => value !== null);

  if (!amounts.length) return { band: zeroBand(), rows };
  return {
    band: {
      low: Math.min(...amounts),
      base: amounts[0],
      high: Math.max(...amounts)
    },
    rows
  };
}

function emergencySurcharge(input: CalculatorInput, selected: MaternityPackage) {
  if (input.delivery !== "direct_emergency" || selected.delivery === "direct_emergency") {
    return { band: zeroBand(), rows: [] as Surcharge[] };
  }
  const rows = database.surcharges.filter(
    (row) =>
      row.hospitalId === input.hospitalId &&
      /非預約剖腹|緊急剖腹|非預約緊急剖腹/.test(row.name)
  );
  const amounts = rows
    .map((row) => parseAmount(row.amountRaw, input.hospitalId, input.room))
    .filter((value): value is number => value !== null);
  const amount = amounts[0] ?? 0;
  return { band: { low: amount, base: amount, high: amount }, rows };
}

function findProfessionalProfile(input: CalculatorInput): ProfessionalEstimate | undefined {
  const roomClass = classifyRoom(input.room);
  const hospitalRows = database.professionalEstimates.filter(
    (row) => row.hospitalId === input.hospitalId && row.delivery === input.delivery
  );

  if (hospitalRows.length) {
    const matching = hospitalRows.filter((row) => classifyRoom(row.room) === roomClass);
    return [...matching].sort(
      (a, b) => Math.abs(a.baseDays - input.accommodationDays) - Math.abs(b.baseDays - input.accommodationDays)
    )[0];
  }

  const genericPrefix = input.delivery === "natural" ? "GEN-NATURAL" : "GEN-CSEC";
  const genericId =
    roomClass === "private"
      ? `${genericPrefix}-PRIVATE`
      : roomClass === "semi"
        ? `${genericPrefix}-SEMI`
        : `${genericPrefix}-STANDARD`;
  return database.professionalEstimates.find((row) => row.id.startsWith(genericId));
}

function componentBand(
  estimate: ProfessionalEstimate,
  component: "obstetrician" | "anaesthetist" | "obRound" | "paediatrician",
  input: CalculatorInput
): EstimateBand {
  const quote = input.professionalQuote;
  const multiplier = estimate.roomMultiplier;
  const keys = ["low", "base", "high"] as const;

  if (component === "obstetrician" && quote.obstetrician !== undefined) {
    return { low: quote.obstetrician, base: quote.obstetrician, high: quote.obstetrician };
  }
  if (component === "anaesthetist" && quote.anaesthetist !== undefined) {
    return { low: quote.anaesthetist, base: quote.anaesthetist, high: quote.anaesthetist };
  }
  if (component === "obRound" && quote.obstetricianRoundPerDay !== undefined) {
    const value = quote.obstetricianRoundPerDay * input.obstetricianRounds;
    return { low: value, base: value, high: value };
  }
  if (component === "paediatrician" && quote.paediatricianRoundPerBabyDay !== undefined) {
    const value = quote.paediatricianRoundPerBabyDay * input.paediatricianRounds * input.babyCount;
    return { low: value, base: value, high: value };
  }

  return Object.fromEntries(
    keys.map((key) => {
      let value = 0;
      if (component === "obstetrician") value = estimate.obstetrician[key];
      if (component === "anaesthetist") {
        value = estimate.obstetrician[key] * estimate.anaesthetistRatio[key];
      }
      if (component === "obRound") value = estimate.obRound[key] * input.obstetricianRounds;
      if (component === "paediatrician") {
        value = estimate.paediatricianRound[key] * input.paediatricianRounds * input.babyCount;
      }
      return [key, value * multiplier[key]];
    })
  ) as unknown as EstimateBand;
}

function getProfessional(input: CalculatorInput, selected: MaternityPackage) {
  if (selected.professionalIncluded) {
    return {
      band: zeroBand(),
      items: [] as BreakdownItem[],
      babyBand: zeroBand(),
      babyItems: [] as BreakdownItem[],
      confidence: "high" as Confidence,
      note: "所選全包套餐已包括指定專業費。"
    };
  }

  const profile = findProfessionalProfile(input);
  if (!profile) {
    return {
      band: zeroBand(),
      items: [] as BreakdownItem[],
      babyBand: zeroBand(),
      babyItems: [] as BreakdownItem[],
      confidence: "low" as Confidence,
      note: "未有足夠專業費資料。"
    };
  }

  type ComponentKey = "obstetrician" | "anaesthetist" | "obRound" | "paediatrician";
  const components: Array<[ComponentKey, string, string]> = [
    [
      "obstetrician",
      input.delivery === "natural" ? "產科醫生接生費" : "產科醫生手術費",
      input.delivery === "natural" ? "一次性接生專業費" : "一次性剖腹手術專業費"
    ],
    ["obRound", "產科醫生巡房", `${input.obstetricianRounds} 次`]
  ];

  if (input.delivery !== "natural" || input.epidural) {
    components.splice(1, 0, [
      "anaesthetist",
      "麻醉師費",
      input.delivery === "natural"
        ? "選用無痛分娩時的麻醉專業費估算"
        : "按麻醉師報價或產科醫生費比例估算"
    ]);
  }

  if (!selected.paediatricianIncluded) {
    components.push([
      "paediatrician",
      "BB兒科醫生巡房費",
      `${input.babyCount} 名BB × ${input.paediatricianRounds} 次`
    ]);
  }

  const allItems: BreakdownItem[] = components.map(([key, label, detail]) => {
    const band = componentBand(profile, key, input);
    const quoteKey = {
      obstetrician: input.professionalQuote.obstetrician,
      anaesthetist: input.professionalQuote.anaesthetist,
      obRound: input.professionalQuote.obstetricianRoundPerDay,
      paediatrician: input.professionalQuote.paediatricianRoundPerBabyDay
    }[key];
    return {
      id: `professional-${key}`,
      label,
      detail,
      ...band,
      kind: key === "paediatrician" ? ("baby" as const) : ("professional" as const),
      source: quoteKey !== undefined ? ("user" as const) : ("estimate" as const)
    };
  });

  const professionalSurchargeTriggers = [
    input.timing === "off_hours" ? "夜間／假日" : null,
    isEmergencyCSection(input) ? "緊急剖腹" : null
  ].filter((item): item is string => item !== null);
  const professionalExtraSurcharge =
    professionalSurchargeTriggers.length > 0 && input.professionalSurchargePercent > 0;

  if (professionalExtraSurcharge) {
    const obstetrician = allItems.find((item) => item.id === "professional-obstetrician");
    const anaesthetist = allItems.find((item) => item.id === "professional-anaesthetist");
    const eligibleItems = [obstetrician, anaesthetist].filter(
      (item): item is BreakdownItem => item !== undefined
    );
    if (eligibleItems.length) {
      const rate = input.professionalSurchargePercent / 100;
      const surcharge = {
        low: eligibleItems.reduce((sum, item) => sum + item.low * rate, 0),
        base: eligibleItems.reduce((sum, item) => sum + item.base * rate, 0),
        high: eligibleItems.reduce((sum, item) => sum + item.high * rate, 0)
      };
      allItems.push({
        id: "professional-extra-surcharge",
        label: `${professionalSurchargeTriggers.join("及")}專業費附加`,
        detail: `產科醫生${input.delivery === "natural" ? "接生" : "手術"}費${
          anaesthetist ? "及麻醉師費" : ""
        }加 ${input.professionalSurchargePercent}%`,
        ...surcharge,
        kind: "professional",
        source: "user"
      });
    }
  }

  const items = allItems.filter((item) => item.kind === "professional");
  const babyItems = allItems.filter((item) => item.kind === "baby");
  const band = items.reduce(
    (sum, item) => addBand(sum, { low: item.low, base: item.base, high: item.high }),
    zeroBand()
  );
  const babyBand = babyItems.reduce(
    (sum, item) => addBand(sum, { low: item.low, base: item.base, high: item.high }),
    zeroBand()
  );

  return {
    band: {
      low: roundMoney(band.low),
      base: roundMoney(band.base),
      high: roundMoney(band.high)
    },
    items,
    babyBand: {
      low: roundMoney(babyBand.low),
      base: roundMoney(babyBand.base),
      high: roundMoney(babyBand.high)
    },
    babyItems,
    confidence: profile.confidence === "中" ? ("medium" as Confidence) : ("low" as Confidence),
    note: profile.note
  };
}

function getExtraNightRate(input: CalculatorInput, selected: MaternityPackage) {
  const roomClass = classifyRoom(input.room);
  const extraItem = database.feeItems.find(
    (item) => item.hospitalId === input.hospitalId && /計劃以外每晚留院/.test(item.name)
  );
  if (extraItem) {
    const amount = roomClass === "private" ? extraItem.private : extraItem.standard;
    if (amount) return { low: amount, base: amount, high: amount, sourceUrl: extraItem.sourceUrl };
  }
  if (selected.roomRateLow || selected.roomRateHigh) {
    return {
      low: selected.roomRateLow ?? selected.roomRateHigh ?? 0,
      base: selected.roomRateLow ?? selected.roomRateHigh ?? 0,
      high: selected.roomRateHigh ?? selected.roomRateLow ?? 0,
      sourceUrl: selected.sourceUrl
    };
  }
  const feeItem = database.feeItems.find(
    (item) =>
      item.hospitalId === input.hospitalId &&
      item.category === "房租" &&
      (item.name.includes(input.room.replace(/[（）()]/g, "")) ||
        (roomClass === "private" && /私家/.test(item.name)) ||
        (roomClass === "semi" && /半私家/.test(item.name)) ||
        (roomClass === "standard" && /標準|普通/.test(item.name)))
  );
  if (!feeItem) return null;
  const amount =
    roomClass === "private"
      ? feeItem.private
      : roomClass === "semi"
        ? feeItem.semiPrivate ?? feeItem.standard
        : feeItem.standard;
  return amount
    ? { low: amount, base: amount, high: amount, sourceUrl: feeItem.sourceUrl }
    : null;
}

function getBabyNightRate(input: CalculatorInput) {
  const item = database.feeItems.find(
    (fee) =>
      fee.hospitalId === input.hospitalId &&
      /育嬰房|Nursery每日/.test(fee.name) &&
      !/Special|特殊/.test(fee.name)
  );
  if (!item) return null;
  const roomClass = classifyRoom(input.room);
  const value = roomClass === "private"
    ? item.private ?? item.semiPrivate ?? item.standard
    : roomClass === "semi"
      ? item.semiPrivate ?? item.standard ?? item.private
      : item.standard ?? item.semiPrivate ?? item.private;
  return value ? { value, sourceUrl: item.sourceUrl } : null;
}

function getFeeItemAmount(input: CalculatorInput, item: (typeof database.feeItems)[number]) {
  const roomClass = classifyRoom(input.room);
  if (input.hospitalId === "UH" && input.room.includes("半私家雙人房")) {
    return item.standard;
  }
  if (roomClass === "private") return item.private ?? item.semiPrivate ?? item.standard;
  if (roomClass === "semi") return item.semiPrivate ?? item.standard ?? item.private;
  return item.standard ?? item.semiPrivate ?? item.private;
}

function getNaturalHospitalExtras(input: CalculatorInput) {
  const items: BreakdownItem[] = [];
  const sourceUrls: string[] = [];

  const addFee = (pattern: RegExp, id: string, label: string, detail: string) => {
    const feeItem = database.feeItems.find(
      (item) => item.hospitalId === input.hospitalId && pattern.test(item.name)
    );
    if (!feeItem) return false;
    const amount = getFeeItemAmount(input, feeItem);
    if (amount === null) return false;
    sourceUrls.push(feeItem.sourceUrl);
    items.push({
      id,
      label,
      detail,
      low: amount,
      base: amount,
      high: amount,
      kind: "hospital",
      source: "verified"
    });
    return true;
  };

  if (input.epidural) {
    addFee(
      /無痛分娩|硬膜外麻醉|硬脊膜外麻醉|產房內硬膜外麻醉/,
      "natural-epidural",
      "院方無痛分娩費",
      "麻醉師專業費另列於專業費"
    );
  }
  if (input.instrumentalDelivery) {
    addFee(
      /助產器械|儀器輔助分娩/,
      "natural-instrumental",
      "院方助產器械費",
      "真空吸引或產鉗"
    );
  }
  if (input.timing === "off_hours") {
    addFee(
      /星期六、日及公眾假期催生附加/,
      "natural-holiday-induction",
      "假日催生附加",
      "星期六、日或公眾假期"
    );
  }

  const band = items.reduce(
    (sum, item) => addBand(sum, { low: item.low, base: item.base, high: item.high }),
    zeroBand()
  );
  return { items, band, sourceUrls };
}

function confidenceRank(value: Confidence) {
  return { high: 3, medium: 2, low: 1 }[value];
}

function minConfidence(...values: Confidence[]) {
  return values.sort((a, b) => confidenceRank(a) - confidenceRank(b))[0];
}

export function calculateEstimate(input: CalculatorInput): CalculatorResult {
  const match = selectPackageMatch(input);
  const selected = match.package;
  const warnings: string[] = [];
  const breakdown: BreakdownItem[] = [];
  const sourceUrls = new Set<string>();

  if (!selected) {
    return {
      low: 0,
      base: 0,
      high: 0,
      hospitalSubtotal: zeroBand(),
      professionalSubtotal: zeroBand(),
      babySubtotal: zeroBand(),
      reserveSubtotal: zeroBand(),
      breakdown: [],
      warnings: ["暫時沒有符合條件的套餐資料。"],
      confidence: "low",
      confidenceLabel: "資料不足",
      largestUncertainty: "院方套餐",
      selectedPackage: null,
      packageFallbackReason: match.fallbackReason,
      packagePrice: 0,
      outsidePackageTotal: 0,
      estimatedBillGap: 0,
      confidenceByGroup: { hospital: "low", professional: "low", baby: "low" },
      cases: [],
      sources: []
    };
  }

  sourceUrls.add(selected.sourceUrl);
  if (match.fallbackReason) warnings.push(`套餐Fallback：${match.fallbackReason}`);
  breakdown.push({
    id: "package",
    label: "醫院分娩套餐",
    detail: `${selected.room} · ${selected.stayLabel}`,
    low: selected.price,
    base: selected.price,
    high: selected.price,
    kind: "hospital",
    source: selected.sourceType === "official" ? "verified" : "secondary"
  });
  let hospitalSubtotal: EstimateBand = {
    low: selected.price,
    base: selected.price,
    high: selected.price
  };

  if (selected.sourceType === "secondary") {
    warnings.push("此院套餐暫用2026年保險公司價格快照，入院前請向醫院確認。");
  }

  if (selected.roomIncluded === false) {
    const days = selected.roomChargeUnits ?? selected.packageDays ?? input.accommodationDays;
    const roomBand = {
      low: (selected.roomRateLow ?? 0) * days,
      base: (selected.roomRateLow ?? selected.roomRateHigh ?? 0) * days,
      high: (selected.roomRateHigh ?? selected.roomRateLow ?? 0) * days
    };
    breakdown.push({
      id: "room",
      label: "套餐外房租",
      detail: `${days} 日`,
      ...roomBand,
      kind: "hospital",
      source: "verified"
    });
    hospitalSubtotal = addBand(hospitalSubtotal, roomBand);
  } else if (selected.roomIncluded === null) {
    warnings.push("院方未清楚公開套餐是否已包括房租；目前未重複加入房租。");
  }

  const timing =
    input.delivery === "natural"
      ? { band: zeroBand(), rows: [] as Surcharge[] }
      : timingSurcharge(input, selected);
  if (timing.rows.length) timing.rows.forEach((row) => sourceUrls.add(row.sourceUrl));
  if (timing.band.high > 0) {
    breakdown.push({
      id: "timing",
      label: input.timing === "specified" ? "院方指定時間附加" : "院方夜間／假日附加",
      detail: input.timing === "specified" ? "日間指定時辰" : "實際金額視時段",
      ...timing.band,
      kind: "hospital",
      source: "verified"
    });
    hospitalSubtotal = addBand(hospitalSubtotal, timing.band);
  } else if (
    input.delivery !== "natural" &&
    input.timing !== "standard" &&
    selected.timing !== input.timing
  ) {
    warnings.push("所選醫院未有公開這個時段的固定附加費，結果未計入該項。");
  }

  const emergency = emergencySurcharge(input, selected);
  if (emergency.rows.length) emergency.rows.forEach((row) => sourceUrls.add(row.sourceUrl));
  if (emergency.band.high > 0) {
    breakdown.push({
      id: "emergency",
      label: "院方非預約／緊急附加",
      detail: "未使用試產後緊急套餐",
      ...emergency.band,
      kind: "hospital",
      source: "verified"
    });
    hospitalSubtotal = addBand(hospitalSubtotal, emergency.band);
  } else if (input.delivery === "direct_emergency" && selected.delivery !== "direct_emergency") {
    warnings.push("院方確認設有緊急剖腹附加，但固定金額未公開，結果可能偏低。");
  }

  if (input.delivery === "natural") {
    const extras = getNaturalHospitalExtras(input);
    breakdown.push(...extras.items);
    hospitalSubtotal = addBand(hospitalSubtotal, extras.band);
    extras.sourceUrls.forEach((url) => sourceUrls.add(url));
    if (input.epidural && !extras.items.some((item) => item.id === "natural-epidural")) {
      warnings.push("所選醫院未有公開無痛分娩院方固定價，現時只計麻醉師專業費估算。");
    }
    if (
      input.instrumentalDelivery &&
      !extras.items.some((item) => item.id === "natural-instrumental")
    ) {
      warnings.push("所選醫院未有公開助產器械固定價，結果未計入該項。");
    }
  }

  if (input.babyCount > 1) {
    if (selected.multiplePercent !== null) {
      const extraBabies = selected.specialTwin ? Math.max(0, input.babyCount - 2) : input.babyCount - 1;
      const amount = selected.price * selected.multiplePercent * extraBabies;
      if (amount > 0) {
        const band = { low: amount, base: amount, high: amount };
        breakdown.push({
          id: "multifetal",
          label: "多胎院方附加",
          detail: `${extraBabies} 名額外嬰兒 × ${Math.round(selected.multiplePercent * 100)}%`,
          ...band,
          kind: "baby",
          source: selected.sourceType === "official" ? "verified" : "secondary"
        });
        hospitalSubtotal = addBand(hospitalSubtotal, band);
      }
      if (selected.hospitalId === "GHK") {
        warnings.push("港怡多胎35%的計算基數仍待院方確認，本工具按第二名BB起計。");
      }
    } else {
      warnings.push("多胎套餐附加規則未公開，現時未加入院方多胎費。");
    }
  }

  if (input.extraMotherNights > 0) {
    const rate = getExtraNightRate(input, selected);
    if (rate) {
      sourceUrls.add(rate.sourceUrl);
      const band = {
        low: rate.low * input.extraMotherNights,
        base: rate.base * input.extraMotherNights,
        high: rate.high * input.extraMotherNights
      };
      breakdown.push({
        id: "extra-mother-night",
        label: "媽媽額外留院",
        detail: `${input.extraMotherNights} 晚`,
        ...band,
        kind: "hospital",
        source: "verified"
      });
      hospitalSubtotal = addBand(hospitalSubtotal, band);
    } else {
      warnings.push("未有媽媽額外留院的可靠日價，已保留日數但未計入金額。");
    }
  }

  let babySubtotal = zeroBand();
  if (input.extraBabyNights > 0) {
    const babyRate = getBabyNightRate(input);
    if (babyRate) {
      sourceUrls.add(babyRate.sourceUrl);
      const amount = babyRate.value * input.extraBabyNights * input.babyCount;
      const band = { low: amount, base: amount, high: amount };
      breakdown.push({
        id: "extra-baby-night",
        label: "BB額外留院／育嬰房",
        detail: `${input.babyCount} 名BB × ${input.extraBabyNights} 晚`,
        ...band,
        kind: "baby",
        source: "verified"
      });
      babySubtotal = addBand(babySubtotal, band);
    } else {
      warnings.push("未有BB額外留院的可靠院方日價，已保留日數但未計入金額。");
    }
  }

  if (input.hospitalId === "UH") {
    breakdown.push({
      id: "uh-baby-included-screening",
      label: "仁安初生BB基本篩查",
      detail: "套餐已包括 G6PD、TSH、血型及聽力篩查",
      low: 0,
      base: 0,
      high: 0,
      kind: "baby",
      source: "verified"
    });
  }

  const babyScreeningReference = getBabyScreeningReference(input.babyScreeningPlanId);
  babyScreeningReference.sourceUrls.forEach((url) => sourceUrls.add(url));
  if (input.babyScreeningPlanId !== "none" || input.babyScreeningFee > 0) {
    const amount = input.babyScreeningFee * input.babyCount;
    const screeningBand = { low: amount, base: amount, high: amount };
    const isUserOverride =
      input.babyScreeningPlanId === "manual" ||
      (babyScreeningReference.feePerBaby !== input.babyScreeningFee && input.babyScreeningFee > 0);
    breakdown.push({
      id: "baby-extra-screening",
      label: "額外代謝病篩查／BB化驗",
      detail:
        amount > 0
          ? `${isUserOverride ? "按輸入金額" : babyScreeningReference.shortLabel} · ${
              input.babyCount
            } 名BB × ${moneyLike(
              input.babyScreeningFee
            )}`
          : `${babyScreeningReference.shortLabel} · ${babyScreeningReference.detail}`,
      ...screeningBand,
      kind: "baby",
      source: isUserOverride || babyScreeningReference.sourceType === "user"
        ? "user"
        : babyScreeningReference.source
    });
    babySubtotal = addBand(babySubtotal, screeningBand);
    if (input.babyScreeningPlanId === "hkbgi-nova" && input.babyScreeningFee === 0) {
      warnings.push("華大NOVA代謝疾病篩查未見公開價目，已列作參考但未計入金額。");
    }
    if (input.babyScreeningPlanId === "cuhk-private") {
      warnings.push("中大新生兒代謝病篩查目前使用網上二級價格參考，實際收費請以醫院或化驗所為準。");
    }
  }

  const professional = getProfessional(input, selected);
  breakdown.push(...professional.items, ...professional.babyItems);
  const professionalSubtotal = professional.band;
  babySubtotal = addBand(babySubtotal, professional.babyBand);

  if (!selected.professionalIncluded) {
    warnings.push(
      professional.confidence === "low"
        ? "專業費採用跨醫院房型估算；輸入正式醫生報價後會直接取代估算。"
        : professional.note
    );
  }
  if (
    (input.timing === "off_hours" || isEmergencyCSection(input)) &&
    !selected.professionalIncluded &&
    input.professionalSurchargePercent > 0
  ) {
    const triggers = [
      input.timing === "off_hours" ? "夜間／假日" : null,
      isEmergencyCSection(input) ? "緊急剖腹" : null
    ].filter((item): item is string => item !== null);
    warnings.push(
      `${triggers.join("及")}專業費暫按${input.professionalSurchargePercent}%計算；這是可修改假設，並非院方統一醫生收費。`
    );
  }
  if (input.delivery === "natural") {
    warnings.push("自然分娩使用獨立接生費Profile；沒有選無痛分娩時不計麻醉師費。");
  }

  const total = addBand(addBand(hospitalSubtotal, professionalSubtotal), babySubtotal);
  const reserveSubtotal = zeroBand();
  const hospital = getHospital(input.hospitalId);
  const hospitalConfidence: Confidence =
    selected.sourceType === "secondary"
      ? "low"
      : hospital?.confidence === "high"
        ? "high"
        : "medium";
  const confidence = minConfidence(hospitalConfidence, professional.confidence);
  const largestUncertainty =
    selected.sourceType === "secondary"
      ? "院方套餐仍屬二級來源"
      : professional.confidence === "low"
        ? "個別醫療團隊專業費"
        : warnings.some((warning) => warning.includes("固定金額未公開"))
          ? "未公開的院方附加費"
          : "突發檢查、藥物及BB護理";

  const babyConfidence: Confidence = breakdown
    .filter((item) => item.kind === "baby")
    .some((item) => item.source === "estimate" || item.source === "secondary")
      ? "low"
      : "high";
  const cases = database.cases
    .map((item) => {
      const year = Number(item.year.match(/20\d{2}/)?.[0] ?? 0);
      const score =
        (item.hospitalId === input.hospitalId ? 1000 : 0) +
        (item.delivery.includes(input.delivery === "natural" ? "順產" : "剖腹") ? 300 : 0) +
        (item.room.includes(input.room.replace(/[（(].*$/, "")) ? 150 : 0) +
        ({ A: 30, B: 20, C: 10 }[item.evidence] ?? 0) +
        year / 100;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ item }) => item);
  const sources = Array.from(sourceUrls).map((url) =>
    database.sources.find((source) => source.url === url) ?? {
      id: `SOURCE-${url}`,
      organization: getHospital(input.hospitalId)?.name ?? "資料提供者",
      name: "收費資料頁",
      url,
      effective: "未註明",
      checked: selected.lastVerified,
      reliability: selected.sourceType === "official" ? "官方" : "二級來源",
      limitation: "請以連結內最新版本為準。"
    }
  );
  const staleSources = sources.filter(
    (source) => Date.now() - new Date(source.checked).getTime() > 180 * 24 * 60 * 60 * 1000
  );
  if (staleSources.length) warnings.push(`${staleSources.length} 項資料超過180日未核實，請先向院方確認。`);
  const packagePrice = selected.price;
  const estimatedBillGap = Math.max(0, roundMoney(total.base) - packagePrice);

  return {
    // Product decision: the public low/base/high contract intentionally exposes one central estimate.
    // Internal component bands remain available for audit, but a broad price range is not shown to users.
    low: roundMoney(total.base),
    base: roundMoney(total.base),
    high: roundMoney(total.base),
    hospitalSubtotal,
    professionalSubtotal,
    babySubtotal,
    reserveSubtotal,
    breakdown: breakdown.map((item) => ({
      ...item,
      low: roundMoney(item.low),
      base: roundMoney(item.base),
      high: roundMoney(item.high)
    })),
    warnings: Array.from(new Set(warnings.filter(Boolean))),
    confidence,
    confidenceLabel: { high: "較高", medium: "中等", low: "較低" }[confidence],
    largestUncertainty,
    selectedPackage: selected,
    packageFallbackReason: match.fallbackReason,
    packagePrice,
    outsidePackageTotal: estimatedBillGap,
    estimatedBillGap,
    confidenceByGroup: {
      hospital: hospitalConfidence,
      professional: professional.confidence,
      baby: babyConfidence
    },
    cases,
    sources
  };
}
