import rawDatabase from "./data/database.json";
import naturalData from "./data/natural-data.json";
import type { CalculatorDatabase, FeeItem, MaternityPackage } from "./types";

const baseDatabase = rawDatabase as CalculatorDatabase;

export const database: CalculatorDatabase = {
  ...baseDatabase,
  packages: [
    ...baseDatabase.packages,
    ...(naturalData.packages as MaternityPackage[])
  ],
  feeItems: [
    ...baseDatabase.feeItems,
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
