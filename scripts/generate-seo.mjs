import fs from "node:fs/promises";
import path from "node:path";
import database from "../src/data/database.json" with { type: "json" };

const rootUrl = "https://hbsz-project.github.io/hk-hospital-calc";
const dist = path.resolve("dist");
const template = await fs.readFile(path.join(dist, "index.html"), "utf8");
const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

for (const hospital of database.hospitals) {
  if (!database.packages.some((item) => item.hospitalId === hospital.id)) continue;
  const slug = hospital.id.toLowerCase();
  const url = `${rootUrl}/hospitals/${slug}/`;
  const title = `${hospital.name}分娩費用估算及套餐比較｜香港私家醫院`;
  const description = `查看${hospital.name}分娩套餐、專業費及BB費用的中央估算，並比較標準房與私家房。資料核實至${database.release.sheetVerified}。`;
  let html = template
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${url}" />`)
    .replace(/(src|href)="\.\//g, '$1="../../')
    .replace(/<div id="root">[\s\S]*?<\/div>\s*<script type="module"/, `<div id="root"><main><h1>${escapeHtml(hospital.name)}分娩費用估算</h1><p>${escapeHtml(description)}</p><p>資料更新日期：${database.release.sheetVerified}</p></main></div><script type="module"`);
  const directory = path.join(dist, "hospitals", slug);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "index.html"), html, "utf8");
}

const hospitalUrls = database.hospitals
  .filter((hospital) => database.packages.some((item) => item.hospitalId === hospital.id))
  .map((hospital) => `  <url><loc>${rootUrl}/hospitals/${hospital.id.toLowerCase()}/</loc><lastmod>${database.release.sheetVerified}</lastmod></url>`)
  .join("\n");
await fs.writeFile(path.join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${rootUrl}/</loc><lastmod>${database.release.sheetVerified}</lastmod></url>\n${hospitalUrls}\n</urlset>\n`, "utf8");
await fs.writeFile(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${rootUrl}/sitemap.xml\n`, "utf8");
console.log(`Generated ${database.hospitals.length} hospital landing pages, sitemap.xml and robots.txt`);
