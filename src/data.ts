import rawDatabase from "./data/database.json";
import naturalData from "./data/natural-data.json";
import type { CalculatorDatabase, FeeItem, MaternityPackage } from "./types";

type ImportedPackage = Omit<MaternityPackage, "packageDays" | "packageNights" | "roomChargeUnits"> & {
  stayDays?: number | null;
  packageDays?: number | null;
  packageNights?: number | null;
  roomChargeUnits?: number | null;
};

const rawBaseDatabase = rawDatabase as unknown as Omit<CalculatorDatabase, "packages"> & {
  packages: ImportedPackage[];
};

const normalisePackage = (item: ImportedPackage): MaternityPackage => {
  const packageDays = item.packageDays ?? item.stayDays ?? null;
  const packageNights = item.packageNights !== undefined
    ? item.packageNights
    : packageDays === null
      ? null
      : Math.max(0, packageDays - 1);
  return {
    ...item,
    packageDays,
    packageNights,
    roomChargeUnits:
      item.roomChargeUnits !== undefined ? item.roomChargeUnits : item.roomIncluded === false ? packageDays : 0
  };
};

export const database: CalculatorDatabase = {
  ...rawBaseDatabase,
  packages: [
    ...rawBaseDatabase.packages,
    ...(naturalData.packages as unknown as ImportedPackage[])
  ].map(normalisePackage),
  professionalEstimates: [
    ...rawBaseDatabase.professionalEstimates,
    ...rawBaseDatabase.professionalEstimates
      .filter((profile) => profile.delivery === "elective")
      .map((profile) => ({
        ...profile,
        id: profile.id.replace("CSEC", "NATURAL"),
        delivery: "natural" as const,
        evidence: `${profile.evidence}；自然分娩獨立估算基準`,
        note: "自然分娩接生費Profile；不沿用剖腹手術選擇邏輯，無痛麻醉另計。"
      })),
  ],
  feeItems: [
    ...rawBaseDatabase.feeItems,
    ...(naturalData.feeItems as FeeItem[])
  ]
};

export const hospitals = database.hospitals.filter((hospital) =>
  database.packages.some((item) => item.hospitalId === hospital.id)
);

export function getHospital(hospitalId: string) {
  return hospitals.find((hospital) => hospital.id === hospitalId);
}

export function getRooms(hospitalId: string) {
  return Array.from(
    new Set(
      database.packages
        .filter((item) => item.hospitalId === hospitalId)
        .map((item) => item.room)
    )
  );
}

export function hasPackageMode(hospitalId: string, mode: "hospital" | "total_care") {
  return database.packages.some(
    (item) => item.hospitalId === hospitalId && item.packageMode === mode
  );
}
