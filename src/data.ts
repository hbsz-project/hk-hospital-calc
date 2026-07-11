import rawDatabase from "./data/database.json";
import type { CalculatorDatabase } from "./types";

export const database = rawDatabase as CalculatorDatabase;

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
