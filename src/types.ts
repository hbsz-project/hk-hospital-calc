export type DeliveryScenario = "natural" | "elective" | "direct_emergency" | "after_labor";
export type TimingScenario = "standard" | "specified" | "off_hours";
export type PackageMode = "standard" | "hospital" | "total_care";
export type Confidence = "high" | "medium" | "low";

export interface Hospital {
  id: string;
  name: string;
  nameEn: string;
  officialUrl: string;
  status: string;
  version: string;
  completeness: number;
  confidence: string;
  lastVerified: string;
  notes: string;
}

export interface MaternityPackage {
  id: string;
  hospitalId: string;
  room: string;
  delivery: DeliveryScenario;
  timing: TimingScenario;
  packageMode: PackageMode;
  stayDays: number | null;
  stayLabel: string;
  price: number;
  roomIncluded: boolean | null;
  roomRateLow: number | null;
  roomRateHigh: number | null;
  professionalIncluded: boolean;
  paediatricianIncluded: boolean;
  multiplePercent: number | null;
  specialTwin: boolean;
  sourceType: "official" | "secondary";
  sourceUrl: string;
  dataStatus: string;
  lastVerified: string;
  note: string | null;
}

export interface Surcharge {
  id: string;
  hospitalId: string;
  roomScope: string;
  name: string;
  trigger: string;
  amountRaw: number | string | null;
  percentage: number | null;
  formula: string;
  status: string;
  sourceUrl: string;
  lastVerified: string;
  note: string | null;
}

export interface FeeItem {
  id: string;
  hospitalId: string;
  subject: string;
  category: string;
  name: string;
  standard: number | null;
  semiPrivate: number | null;
  private: number | null;
  unit: string;
  relationship: string;
  trigger: string;
  sourceUrl: string;
  lastVerified: string;
  note: string | null;
}

export interface EstimateBand {
  low: number;
  base: number;
  high: number;
}

export interface ProfessionalEstimate {
  id: string;
  hospitalId: string;
  room: string;
  delivery: DeliveryScenario;
  baseBabyCount: number;
  baseDays: number;
  evidence: string;
  obstetrician: EstimateBand;
  anaesthetistRatio: EstimateBand;
  obRound: EstimateBand;
  paediatricianRound: EstimateBand;
  roomMultiplier: EstimateBand;
  confidence: string;
  auto: boolean;
  note: string;
}

export interface PublicCase {
  id: string;
  hospitalId: string;
  hospital: string;
  year: string;
  room: string;
  delivery: string;
  stay: string;
  total: number;
  professionalCombined: number | null;
  evidence: string;
  use: string;
  sourceUrl: string;
  note: string;
}

export type BabyScreeningSource = "verified" | "secondary" | "user";

export interface BabyScreeningReference {
  id: string;
  label: string;
  shortLabel: string;
  feePerBaby: number | null;
  source: "verified" | "estimate" | "user" | "secondary";
  sourceType: BabyScreeningSource;
  detail: string;
  note: string;
  sourceUrls: string[];
}

export interface CalculatorDatabase {
  release: {
    version: string;
    sheetVerified: string;
    disclaimer: string;
  };
  hospitals: Hospital[];
  packages: MaternityPackage[];
  surcharges: Surcharge[];
  feeItems: FeeItem[];
  professionalEstimates: ProfessionalEstimate[];
  sources: Array<{
    id: string;
    organization: string;
    name: string;
    url: string;
    effective: string;
    checked: string;
    reliability: string;
    limitation: string;
  }>;
  cases: PublicCase[];
}

export interface ProfessionalQuote {
  obstetrician?: number;
  anaesthetist?: number;
  obstetricianRoundPerDay?: number;
  paediatricianRoundPerBabyDay?: number;
}

export interface CalculatorInput {
  hospitalId: string;
  room: string;
  delivery: DeliveryScenario;
  timing: TimingScenario;
  packageMode: PackageMode;
  stayDays: number;
  babyCount: number;
  extraMotherNights: number;
  extraBabyNights: number;
  epidural: boolean;
  instrumentalDelivery: boolean;
  babyScreeningPlanId: string;
  babyScreeningFee: number;
  professionalSurchargePercent: number;
  professionalQuote: ProfessionalQuote;
}

export interface BreakdownItem {
  id: string;
  label: string;
  detail: string;
  low: number;
  base: number;
  high: number;
  kind: "hospital" | "professional" | "baby" | "reserve";
  source: "verified" | "estimate" | "user" | "secondary";
}

export interface CalculatorResult {
  low: number;
  base: number;
  high: number;
  hospitalSubtotal: EstimateBand;
  professionalSubtotal: EstimateBand;
  babySubtotal: EstimateBand;
  reserveSubtotal: EstimateBand;
  breakdown: BreakdownItem[];
  warnings: string[];
  confidence: Confidence;
  confidenceLabel: string;
  largestUncertainty: string;
  selectedPackage: MaternityPackage | null;
  cases: PublicCase[];
  sourceUrls: string[];
}
