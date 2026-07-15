# 香港私家醫院分娩費用估算器

以 Google Sheets 內已核實的院方套餐、時段附加費和專業費估算資料建立的靜態網站。

## 開發

```bash
npm install
npm run dev
```

## 驗證

```bash
npm test
npm run data:validate
npm run build
```

頂層 `low`、`base`、`high` 刻意回傳同一個 central estimate，產品只顯示單一估算總額；各分項的內部 band 只供資料審核及未來校準。夜間／假日／緊急專業費則保留一個可修改假設，預設為 50%。

## Google Sheets 資料流程

把 Apps Script 或已發佈的 Sheets JSON endpoint 設為 `GOOGLE_SHEETS_JSON_URL`，然後執行：

```bash
npm run data:pull
npm run data:validate -- tmp/database.from-sheets.json
npm run data:diff
```

`data:pull` 會先驗證才寫入暫存快照；`data:diff` 只列出各 collection 的新增、刪除及修改數量，不會直接覆寫正式資料。

## 比較、分享及 SEO

- 同條件比較醫院只使用系統專業費估算，不會把一位醫生的報價套用到其他醫院。
- 分享 URL 保存一般分娩條件，但不保存任何醫生或麻醉師報價。
- 列印頁可直接列印；「儲存PDF」會開啟系統列印視窗，選擇另存為 PDF。
- Production build 會產生每間醫院的 `/hospitals/{id}/` 落地頁、`sitemap.xml` 及 `robots.txt`。

資料版本：2026-07-11。估算只供預算參考，不構成醫院或醫生報價。
