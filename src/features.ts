import { calculateEstimate } from "./calculator";
import { database, getRooms, hasPackageMode, hospitals } from "./data";
import type { CalculatorInput, CalculatorResult, DeliveryScenario, PackageMode, TimingScenario } from "./types";

export type RoomClass = "standard" | "semi" | "private";

export interface HospitalComparison {
  hospitalId: string;
  hospitalName: string;
  room: string;
  result: CalculatorResult;
}

export const defaultInput: CalculatorInput = {
  hospitalId: "UH",
  room: getRooms("UH")[0],
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

export function classifyRoom(room: string): RoomClass {
  if (/私家|套房|Private/i.test(room) && !/半私家/.test(room)) return "private";
  if (/半私家|Twin|單人|一人|Single/i.test(room) && !/標準/.test(room)) return "semi";
  return "standard";
}

const clampInt = (value: string | null, fallback: number, min: number, max: number) => {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
};
const asBoolean = (value: string | null, fallback: boolean) =>
  value === "1" ? true : value === "0" ? false : fallback;

export function inputFromUrl(location: Pick<Location, "pathname" | "search">): CalculatorInput {
  const params = new URLSearchParams(location.search);
  const landingHospital = location.pathname.match(/\/hospitals\/([^/]+)/)?.[1]?.toUpperCase();
  const hospitalId = hospitals.some((item) => item.id === (landingHospital ?? params.get("hospital")))
    ? (landingHospital ?? params.get("hospital"))!
    : defaultInput.hospitalId;
  const rooms = getRooms(hospitalId);
  const requestedRoom = params.get("room");
  const deliveryValues: DeliveryScenario[] = ["natural", "elective", "direct_emergency", "after_labor"];
  const timingValues: TimingScenario[] = ["standard", "specified", "off_hours"];
  const packageValues: PackageMode[] = ["standard", "hospital", "total_care"];
  const delivery = deliveryValues.includes(params.get("delivery") as DeliveryScenario)
    ? params.get("delivery") as DeliveryScenario
    : defaultInput.delivery;
  const timing = timingValues.includes(params.get("timing") as TimingScenario)
    ? params.get("timing") as TimingScenario
    : defaultInput.timing;
  const requestedMode = packageValues.includes(params.get("package") as PackageMode)
    ? params.get("package") as PackageMode
    : "standard";
  const packageMode = database.packages.some(
    (item) => item.hospitalId === hospitalId && item.packageMode === requestedMode
  ) ? requestedMode : hasPackageMode(hospitalId, "hospital") ? "hospital" : "standard";
  return {
    ...defaultInput,
    hospitalId,
    room: requestedRoom && rooms.includes(requestedRoom) ? requestedRoom : rooms[0],
    delivery,
    timing,
    packageMode,
    accommodationDays: clampInt(params.get("days"), defaultInput.accommodationDays, 1, 30),
    obstetricianRounds: clampInt(params.get("obRounds"), defaultInput.obstetricianRounds, 0, 30),
    paediatricianRounds: clampInt(params.get("paedRounds"), defaultInput.paediatricianRounds, 0, 30),
    babyCount: clampInt(params.get("babies"), defaultInput.babyCount, 1, 3),
    extraMotherNights: clampInt(params.get("motherExtra"), 0, 0, 14),
    extraBabyNights: clampInt(params.get("babyExtra"), 0, 0, 30),
    epidural: asBoolean(params.get("epidural"), false),
    instrumentalDelivery: asBoolean(params.get("instrumental"), false),
    babyScreeningPlanId: params.get("screening") ?? "none",
    babyScreeningFee: clampInt(params.get("screeningFee"), 0, 0, 100000),
    professionalSurchargePercent: clampInt(params.get("surcharge"), 50, 0, 300),
    professionalQuote: {}
  };
}

export function buildShareUrl(input: CalculatorInput, origin: string) {
  const params = new URLSearchParams({
    hospital: input.hospitalId,
    room: input.room,
    delivery: input.delivery,
    timing: input.timing,
    package: input.packageMode,
    days: String(input.accommodationDays),
    obRounds: String(input.obstetricianRounds),
    paedRounds: String(input.paediatricianRounds),
    babies: String(input.babyCount),
    motherExtra: String(input.extraMotherNights),
    babyExtra: String(input.extraBabyNights),
    epidural: input.epidural ? "1" : "0",
    instrumental: input.instrumentalDelivery ? "1" : "0",
    screening: input.babyScreeningPlanId,
    screeningFee: String(input.babyScreeningFee),
    surcharge: String(input.professionalSurchargePercent)
  });
  return `${origin}/hk-hospital-calc/?${params.toString()}`;
}

function comparableInput(input: CalculatorInput, hospitalId: string, roomClass: RoomClass) {
  const candidatePackages = database.packages.filter(
    (item) =>
      item.hospitalId === hospitalId &&
      (item.delivery === input.delivery || (input.delivery !== "natural" && item.delivery === "elective"))
  );
  const sameClass = candidatePackages.filter((item) => classifyRoom(item.room) === roomClass);
  const pool = sameClass.length ? sameClass : candidatePackages;
  const selected = [...pool].sort(
    (a, b) =>
      Math.abs((a.packageDays ?? input.accommodationDays) - input.accommodationDays) -
      Math.abs((b.packageDays ?? input.accommodationDays) - input.accommodationDays)
  )[0];
  if (!selected) return null;
  const packageMode: PackageMode = database.packages.some(
    (item) => item.hospitalId === hospitalId && item.room === selected.room && item.packageMode === input.packageMode
  ) ? input.packageMode : hasPackageMode(hospitalId, "hospital") ? "hospital" : "standard";
  return { ...input, hospitalId, room: selected.room, packageMode, professionalQuote: {} };
}

export function compareHospitals(input: CalculatorInput): HospitalComparison[] {
  const targetClass = classifyRoom(input.room);
  return hospitals.flatMap((hospital) => {
    const comparable = comparableInput(input, hospital.id, targetClass);
    if (!comparable) return [];
    const result = calculateEstimate(comparable);
    if (!result.selectedPackage) return [];
    return [{ hospitalId: hospital.id, hospitalName: hospital.name, room: comparable.room, result }];
  }).sort((a, b) => a.result.base - b.result.base);
}

export function compareRoomClasses(input: CalculatorInput) {
  return (["standard", "private"] as const).flatMap((roomClass) => {
    const comparable = comparableInput(input, input.hospitalId, roomClass);
    return comparable ? [{ roomClass, room: comparable.room, result: calculateEstimate(comparable) }] : [];
  });
}

export function estimateSummary(input: CalculatorInput, result: CalculatorResult, hospitalName: string) {
  return [
    `${hospitalName} 分娩費用估算`,
    `房型：${input.room}`,
    `分娩方式：${input.delivery}`,
    `住宿：${input.accommodationDays}日；BB：${input.babyCount}名`,
    `院方費：HK$${result.hospitalSubtotal.base.toLocaleString("en-US")}`,
    `專業費估算：HK$${result.professionalSubtotal.base.toLocaleString("en-US")}`,
    `BB費用：HK$${result.babySubtotal.base.toLocaleString("en-US")}`,
    `估算總額：HK$${result.base.toLocaleString("en-US")}`,
    `資料可信度：${result.confidenceLabel}`,
    `資料核實日期：${database.release.sheetVerified}`,
    "只供預算參考，最終收費以院方及醫療團隊結算為準。"
  ].join("\n");
}
