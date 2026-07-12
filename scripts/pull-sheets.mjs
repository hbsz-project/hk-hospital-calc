import fs from "node:fs/promises";
import path from "node:path";
import { validateData } from "./validate-data.mjs";

const url = process.env.GOOGLE_SHEETS_JSON_URL;
if (!url) throw new Error("Set GOOGLE_SHEETS_JSON_URL to the published Apps Script/Sheets JSON endpoint.");
const response = await fetch(url, { headers: { accept: "application/json" } });
if (!response.ok) throw new Error(`Sheets pull failed: ${response.status} ${response.statusText}`);
const data = await response.json();
validateData(data, "Google Sheets response");
const output = path.resolve(process.argv[2] ?? "tmp/database.from-sheets.json");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(data, null, 2)}\n`, "utf8");
console.log(`Validated Sheets snapshot written to ${output}`);
