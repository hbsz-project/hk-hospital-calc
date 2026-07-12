import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["src/data/database.json", "src/data/natural-data.json"];

const fail = (message) => { throw new Error(message); };
const required = (object, keys, at) => keys.forEach((key) => {
  if (!(key in object)) fail(`${at}: missing ${key}`);
});
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export function validateData(data, filename = "data") {
  if (!data || typeof data !== "object") fail(`${filename}: root must be an object`);
  if (!Array.isArray(data.packages)) fail(`${filename}: packages must be an array`);
  const ids = new Set();
  data.packages.forEach((item, index) => {
    const at = `${filename}.packages[${index}]`;
    required(item, ["id", "hospitalId", "room", "delivery", "timing", "packageMode", "price", "lastVerified", "sourceUrl"], at);
    if (ids.has(item.id)) fail(`${at}: duplicate id ${item.id}`);
    ids.add(item.id);
    if (!validDate(item.lastVerified)) fail(`${at}: invalid lastVerified`);
    required(item, ["packageDays", "packageNights", "roomChargeUnits"], at);
    if (typeof item.price !== "number" || item.price < 0) fail(`${at}: invalid price`);
  });
  for (const collection of ["hospitals", "surcharges", "feeItems", "professionalEstimates", "sources", "cases"]) {
    if (collection in data && !Array.isArray(data[collection])) fail(`${filename}: ${collection} must be an array`);
  }
  data.hospitals?.forEach((item, index) => {
    required(item, ["id", "name", "lastVerified"], `${filename}.hospitals[${index}]`);
    if (!validDate(item.lastVerified)) fail(`${filename}.hospitals[${index}]: invalid lastVerified`);
  });
  data.sources?.forEach((item, index) => {
    required(item, ["id", "organization", "name", "url", "checked", "reliability"], `${filename}.sources[${index}]`);
    if (!validDate(item.checked)) fail(`${filename}.sources[${index}]: invalid checked date`);
  });
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const filename of files) {
    const absolute = path.resolve(root, filename);
    validateData(JSON.parse(fs.readFileSync(absolute, "utf8")), filename);
    console.log(`✓ ${filename}`);
  }
}
