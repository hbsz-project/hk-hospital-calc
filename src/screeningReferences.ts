import type { BabyScreeningReference } from "./types";

export const babyScreeningReferences: BabyScreeningReference[] = [
  {
    id: "none",
    label: "未加入額外篩查",
    shortLabel: "不加入",
    feePerBaby: 0,
    source: "user",
    sourceType: "user",
    detail: "不把額外代謝病篩查或BB化驗加入估算。",
    note: "如帳單已有金額，可直接在下方輸入。",
    sourceUrls: []
  },
  {
    id: "ha-private-pilot",
    label: "政府／醫管局免費篩查",
    shortLabel: "政府免費",
    feePerBaby: 0,
    source: "verified",
    sourceType: "verified",
    detail: "涵蓋30種先天性代謝病、SCID及SMA；截至2026年5月已包括仁安等六間私家醫院。",
    note: "屬自願參與，實際是否可用以入院時醫院安排為準。",
    sourceUrls: [
      "https://www.info.gov.hk/gia/general/202606/03/P2026060300509.htm",
      "https://www.smartpatient.ha.org.hk/docs/default-source/disease-pdf/%E5%88%9D%E7%94%9F%E5%AC%B0%E5%85%92%E5%85%88%E5%A4%A9%E6%80%A7%E4%BB%A3%E8%AC%9D%E7%97%85%E7%AF%A9%E6%9F%A5%E8%A8%88%E5%8A%83_2025.pdf?sfvrsn=71d35ccb_8"
    ]
  },
  {
    id: "cuhk-private",
    label: "中大新生兒代謝病篩查",
    shortLabel: "中大參考",
    feePerBaby: 1300,
    source: "secondary",
    sourceType: "secondary",
    detail: "中大計劃官方頁未列最新公開價；私營兒科資料列私家醫院約HK$1,300。",
    note: "此為2020年網上價格參考，仁安或其他醫院實際收費可能不同。",
    sourceUrls: [
      "https://www.obg.cuhk.edu.hk/%E6%9C%8D%E5%8B%99/%E8%87%A8%E5%BA%8A%E6%9C%8D%E5%8B%99/%E7%94%A2%E7%A7%91/%E8%83%8E%E5%85%92%E9%86%AB%E5%AD%B8/%E6%96%B0%E7%94%9F%E5%85%92%E4%BB%A3%E8%AC%9D%E7%AF%A9%E6%9F%A5%E8%A8%88%E5%8A%83/",
      "https://luxmed.com.hk/%E5%88%9D%E7%94%9F%E5%AC%B0%E5%85%92%E4%BB%A3%E8%AC%9D%E7%97%85%E6%AA%A2%E6%9F%A5%E5%84%AA%E6%83%A0/"
    ]
  },
  {
    id: "cordlife-subsidy",
    label: "Cordlife 安康檢資助計劃",
    shortLabel: "安康檢",
    feePerBaby: 360,
    source: "verified",
    sourceType: "verified",
    detail: "供應商公開資助價：成功申請者支付HK$360行政費，檢驗費HK$0，篩查38種代謝病。",
    note: "此屬供應商資助計劃，不一定等同醫院即場收費。",
    sourceUrls: [
      "https://biotech.cordlife.com.hk/%E5%AE%89%E5%BA%B7%E6%AA%A2%E4%BB%A3%E8%AC%9D%E7%97%85%E7%AF%A9%E6%9F%A5%E8%B3%87%E5%8A%A9%E8%A8%88%E5%8A%83/"
    ]
  },
  {
    id: "hkbgi-nova",
    label: "華大NOVA代謝疾病篩查",
    shortLabel: "華大NOVA",
    feePerBaby: null,
    source: "secondary",
    sourceType: "secondary",
    detail: "華大香港官網列出NOVA新生兒基因篩查及NOVA代謝疾病篩查，但未見公開價目。",
    note: "如選用此供應商，請把仁安或化驗所報價輸入下方金額欄。",
    sourceUrls: ["https://hkbgi.com/"]
  }
];

export function getBabyScreeningReference(id: string) {
  if (id === "manual") {
    return {
      id: "manual",
      label: "自行輸入金額",
      shortLabel: "自行輸入",
      feePerBaby: null,
      source: "user",
      sourceType: "user",
      detail: "按你在帳單或醫院報價看到的每名BB金額計算。",
      note: "如未有報價，可先選上方其中一個公開參考方案。",
      sourceUrls: []
    } satisfies BabyScreeningReference;
  }
  return babyScreeningReferences.find((item) => item.id === id) ?? babyScreeningReferences[0];
}
