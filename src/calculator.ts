import { database, getHospital } from "./data";
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

function classifyRoom(room: string): "standard" | "semi" | "private" {
  if (/私家|套房|Private/i.test(room) && !/半私家/.test(room)) return "private";
  if (/半私家|雙人房|Twin|一人房|Single/i.test(room) && !/標準/.test(room)) {
    return "semi";
  }
  return "standard";
}

function packageDistance(item: MaternityPackage, input: CalculatorInput) {
  let score = 0;
  if (item.delivery !== input.delivery) score += 100;
  if (item.timing !== input.timing) score += item.timing === "standard" ? 8 : 30;
  if (item.packageMode !== input.packageMode) score += 60;
  if (item.stayDays !== null) score += Math.abs(item.stayDays - input.stayDays);
  if (input.babyCount === 2) score += item.specialTwin ? -12 : 0;
  if (input.babyCount === 1 && item.specialTwin) score += 80;
  return score;
}

export function selectPackage(input: CalculatorInput): MaternityPackage | null {
  const sameRoom = database.packages.filter(
    (item) => item.hospitalId === input.hospitalId && item.room === input.room
  );
  if (!sameRoom.length) return null;

  const exactDelivery = sameRoom.filter((item) => item.delivery === input.delivery);
  const pool = exactDelivery.length
    ? exactDelivery
    : sameRoom.filter((item) => item.delivery === "elective");

  return [...pool].sort((a, b) => packageDistance(a, input) - packageDistance(b, input))[0] ?? null;
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
    (row) => row.hospitalId === input.hospitalId
  );

  if (hospitalRows.length) {
    const matching = hospitalRows.filter((row) => classifyRoom(row.room) === roomClass);
    return [...matching].sort(
      (a, b) => Math.abs(a.baseDays - input.stayDays) - Math.abs(b.baseDays - input.stayDays)
    )[0];
  }

  const genericId =
    roomClass === "private"
      ? "GEN-CSEC-PRIVATE"
      : roomClass === "semi"
        ? "GEN-CSEC-SEMI"
        : "GEN-CSEC-STANDARD";
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
    const value = quote.obstetricianRoundPerDay * input.stayDays;
    return { low: value, base: value, high: value };
  }
  if (component === "paediatrician" && quote.paediatricianRoundPerBabyDay !== undefined) {
    const value = quote.paediatricianRoundPerBabyDay * input.stayDays * input.babyCount;
    return { low: value, base: value, high: value };
  }

  return Object.fromEntries(
    keys.map((key) => {
      let value = 0;
      if (component === "obstetrician") value = estimate.obstetrician[key];
      if (component === "anaesthetist") {
        value = estimate.obstetrician[key] * estimate.anaesthetistRatio[key];
      }
      if (component === "obRound") value = estimate.obRound[key] * input.stayDays;
      if (component === "paediatrician") {
        value = estimate.paediatricianRound[key] * input.stayDays * input.babyCount;
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
      confidence: "high" as Confidence,
      note: "所選全包套餐已包括指定專業費。"
    };
  }

  const profile = findProfessionalProfile(input);
  if (!profile) {
    return {
      band: zeroBand(),
      items: [] as BreakdownItem[],
      confidence: "low" as Confidence,
      note: "未有足夠專業費資料。"
    };
  }

  const components = [
    ["obstetrician", "產科醫生手術費", "一次性手術／接生專業費"],
    ["anaesthetist", "麻醉師費", "按麻醉師報價或產科醫生費比例估算"],
    ["obRound", "產科醫生巡房", `${input.stayDays} 日`],
    ["paediatrician", "兒科醫生巡房", `${input.babyCount} 名BB × ${input.stayDays} 日`]
  ] as const;

  const items: BreakdownItem[] = components.map(([key, label, detail]) => {
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
      kind: "professional" as const,
      source: quoteKey !== undefined ? ("user" as const) : ("estimate" as const)
    };
  });

  let band = items.reduce(
    (sum, item) => addBand(sum, { low: item.low, base: item.base, high: item.high }),
    zeroBand()
  );

  if (input.delivery !== "elective" || input.timing !== "standard") {
    const reserve = {
      low: 0,
      base: band.base * 0.1,
      high: band.high * 0.25
    };
    items.push({
      id: "professional-scenario-reserve",
      label: "專業費時段／緊急預留",
      detail: "個別醫療團隊可能另加，正式比例須向醫生確認",
      ...reserve,
      kind: "professional",
      source: "estimate"
    });
    band = addBand(band, reserve);
  }

  return {
    band: {
      low: roundMoney(band.low),
      base: roundMoney(band.base),
      high: roundMoney(band.high)
    },
    items,
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
  const value = item.standard ?? item.semiPrivate ?? item.private;
  return value ? { value, sourceUrl: item.sourceUrl } : null;
}

function confidenceRank(value: Confidence) {
  return { high: 3, medium: 2, low: 1 }[value];
}

function minConfidence(...values: Confidence[]) {
  return values.sort((a, b) => confidenceRank(a) - confidenceRank(b))[0];
}

export function calculateEstimate(input: CalculatorInput): CalculatorResult {
  const selected = selectPackage(input);
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
      cases: [],
      sourceUrls: []
    };
  }

  sourceUrls.add(selected.sourceUrl);
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
    const days = selected.stayDays ?? input.stayDays;
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

  const timing = timingSurcharge(input, selected);
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
  } else if (input.timing !== "standard" && selected.timing !== input.timing) {
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

  if (input.jaundiceReserve) {
    const jaundiceBand = {
      low: 5700 * input.babyCount,
      base: 9000 * input.babyCount,
      high: 17000 * input.babyCount
    };
    breakdown.push({
      id: "jaundice",
      label: "BB黃疸／額外護理預留",
      detail: `${input.babyCount} 名BB · 通用風險預算`,
      ...jaundiceBand,
      kind: "baby",
      source: "estimate"
    });
    babySubtotal = addBand(babySubtotal, jaundiceBand);
    warnings.push("BB黃疸預留是跨院風險情境，並非所選醫院正式報價。");
  }

  const professional = getProfessional(input, selected);
  breakdown.push(...professional.items);
  const professionalSubtotal = professional.band;

  if (!selected.professionalIncluded) {
    warnings.push(
      professional.confidence === "low"
        ? "專業費採用跨醫院房型估算，正式醫生報價可明顯收窄範圍。"
        : professional.note
    );
  }

  const beforeReserve = addBand(addBand(hospitalSubtotal, professionalSubtotal), babySubtotal);
  const reserveSubtotal = {
    low: beforeReserve.low * Math.max(0.05, input.contingencyPercent / 100 - 0.05),
    base: beforeReserve.base * (input.contingencyPercent / 100),
    high: beforeReserve.high * Math.max(0.15, input.contingencyPercent / 100 + 0.05)
  };
  breakdown.push({
    id: "contingency",
    label: "雜費及突發預備金",
    detail: `基準 ${input.contingencyPercent}%`,
    ...reserveSubtotal,
    kind: "reserve",
    source: "estimate"
  });

  const total = addBand(beforeReserve, reserveSubtotal);
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

  return {
    low: roundMoney(total.low),
    base: roundMoney(total.base),
    high: roundMoney(total.high),
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
    cases: database.cases.filter((item) => item.hospitalId === input.hospitalId).slice(0, 3),
    sourceUrls: Array.from(sourceUrls)
  };
}
