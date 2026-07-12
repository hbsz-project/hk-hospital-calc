import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";

const [beforePath = "src/data/database.json", afterPath = "tmp/database.from-sheets.json"] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
const after = JSON.parse(fs.readFileSync(afterPath, "utf8"));
for (const collection of ["hospitals", "packages", "surcharges", "feeItems", "professionalEstimates", "sources", "cases"]) {
  const left = new Map((before[collection] ?? []).map((item) => [item.id, item]));
  const right = new Map((after[collection] ?? []).map((item) => [item.id, item]));
  const added = [...right.keys()].filter((id) => !left.has(id));
  const removed = [...left.keys()].filter((id) => !right.has(id));
  const changed = [...right.keys()].filter((id) => left.has(id) && !isDeepStrictEqual(left.get(id), right.get(id)));
  if (added.length || removed.length || changed.length) console.log(`${collection}: +${added.length} -${removed.length} ~${changed.length}`);
}
