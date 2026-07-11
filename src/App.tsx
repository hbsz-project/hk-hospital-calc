import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Baby,
  BedDouble,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  FileCheck2,
  HeartPulse,
  Info,
  Minus,
  Plus,
  ReceiptText,
  ShieldCheck,
  Stethoscope
} from "lucide-react";
import { calculateEstimate, selectPackage } from "./calculator";
import { database, getRooms, hasPackageMode, hospitals } from "./data";
import type {
  CalculatorInput,
  DeliveryScenario,
  PackageMode,
  ProfessionalQuote,
  TimingScenario
} from "./types";

const money = new Intl.NumberFormat("zh-HK", {
  style: "currency",
  currency: "HKD",
  maximumFractionDigits: 0
});

const deliveryOptions: Array<{ value: DeliveryScenario; label: string; hint: string }> = [
  { value: "elective", label: "預約剖腹", hint: "預先安排手術" },
  { value: "direct_emergency", label: "直接緊急剖腹", hint: "未使用產房" },
  { value: "after_labor", label: "試產後緊急剖腹", hint: "曾使用產房" }
];

const timingOptions: Array<{ value: TimingScenario; label: string }> = [
  { value: "standard", label: "正常時段" },
  { value: "specified", label: "日間指定時辰" },
  { value: "off_hours", label: "夜間／假日" }
];

const sourceLabels = {
  verified: "官方核實",
  estimate: "模型估算",
  user: "你的報價",
  secondary: "二級來源"
};

function Stepper({
  value,
  min,
  max,
  onChange,
  suffix
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  suffix: string;
}) {
  return (
    <div className="stepper" role="group">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="減少"
      >
        <Minus size={17} />
      </button>
      <output>
        <strong>{value}</strong>
        <span>{suffix}</span>
      </output>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="增加"
      >
        <Plus size={17} />
      </button>
    </div>
  );
}

function CurrencyInput({
  label,
  value,
  onChange,
  suffix
}: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  suffix?: string;
}) {
  return (
    <label className="currency-field">
      <span>{label}</span>
      <div>
        <b>HK$</b>
        <input
          inputMode="numeric"
          min="0"
          placeholder="使用系統估算"
          value={value ?? ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : Number(event.target.value))
          }
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  );
}

function App() {
  const [input, setInput] = useState<CalculatorInput>({
    hospitalId: "UH",
    room: getRooms("UH")[0],
    delivery: "elective",
    timing: "standard",
    packageMode: "standard",
    stayDays: 5,
    babyCount: 1,
    extraMotherNights: 0,
    extraBabyNights: 0,
    jaundiceReserve: false,
    contingencyPercent: 10,
    professionalQuote: {}
  });

  const rooms = useMemo(() => getRooms(input.hospitalId), [input.hospitalId]);
  const result = useMemo(() => calculateEstimate(input), [input]);
  const hospital = hospitals.find((item) => item.id === input.hospitalId);
  const supportsPackageMode =
    hasPackageMode(input.hospitalId, "hospital") &&
    hasPackageMode(input.hospitalId, "total_care");

  useEffect(() => {
    if (!rooms.includes(input.room)) {
      setInput((current) => ({ ...current, room: rooms[0] }));
    }
  }, [rooms, input.room]);

  useEffect(() => {
    const selected = selectPackage(input);
    if (selected?.stayDays && selected.stayDays !== input.stayDays) {
      setInput((current) => ({ ...current, stayDays: selected.stayDays ?? current.stayDays }));
    }
    // Package changes should reset the expected package stay automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    input.hospitalId,
    input.room,
    input.delivery,
    input.timing,
    input.packageMode,
    input.babyCount
  ]);

  const update = <K extends keyof CalculatorInput>(key: K, value: CalculatorInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
  };

  const chooseHospital = (hospitalId: string) => {
    const firstRoom = getRooms(hospitalId)[0];
    const packageMode: PackageMode = hasPackageMode(hospitalId, "hospital")
      ? "hospital"
      : "standard";
    setInput((current) => ({
      ...current,
      hospitalId,
      room: firstRoom,
      packageMode,
      delivery: "elective",
      timing: "standard",
      professionalQuote: {}
    }));
  };

  const updateQuote = (key: keyof ProfessionalQuote, value: number | undefined) => {
    setInput((current) => ({
      ...current,
      professionalQuote: { ...current.professionalQuote, [key]: value }
    }));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          <ReceiptText size={22} />
        </div>
        <div className="brand-copy">
          <span>香港私家醫院</span>
          <strong>剖腹分娩費用估算器</strong>
        </div>
        <div className="data-stamp">
          <FileCheck2 size={16} />
          <span>資料核實至 {database.release.sheetVerified}</span>
        </div>
      </header>

      <main className="calculator-layout">
        <section className="form-pane" aria-label="費用估算條件">
          <div className="intro-line">
            <span>01</span>
            <div>
              <h1>先揀醫院及房型</h1>
              <p>套餐與房租會按已核實資料自動帶入。</p>
            </div>
          </div>

          <label className="select-field">
            <span>
              <Building2 size={17} />
              醫院
            </span>
            <div>
              <select
                value={input.hospitalId}
                onChange={(event) => chooseHospital(event.target.value)}
              >
                {hospitals.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} />
            </div>
          </label>

          {hospital && (
            <div className="hospital-meta">
              <span className={`status-dot ${hospital.confidence}`} />
              <span>資料完整度 {hospital.completeness}%</span>
              <span>院方版本 {hospital.version}</span>
              <a href={hospital.officialUrl} target="_blank" rel="noreferrer">
                官網 <ExternalLink size={13} />
              </a>
            </div>
          )}

          <fieldset className="field-group">
            <legend>
              <BedDouble size={17} />
              房型
            </legend>
            <div className="option-grid room-grid">
              {rooms.map((room) => (
                <button
                  key={room}
                  type="button"
                  className={input.room === room ? "selected" : ""}
                  onClick={() => update("room", room)}
                >
                  {room}
                </button>
              ))}
            </div>
          </fieldset>

          {supportsPackageMode && (
            <fieldset className="field-group">
              <legend>
                <ShieldCheck size={17} />
                明德套餐
              </legend>
              <div className="segmented">
                <button
                  type="button"
                  className={input.packageMode === "hospital" ? "selected" : ""}
                  onClick={() => update("packageMode", "hospital")}
                >
                  Hospital Package
                  <small>專業費另計</small>
                </button>
                <button
                  type="button"
                  className={input.packageMode === "total_care" ? "selected" : ""}
                  onClick={() => update("packageMode", "total_care")}
                >
                  Total Care
                  <small>指定專業費已包</small>
                </button>
              </div>
            </fieldset>
          )}

          <div className="section-rule" />

          <div className="intro-line compact">
            <span>02</span>
            <div>
              <h2>手術情境</h2>
              <p>緊急程度與時段可令院方及醫生費同時增加。</p>
            </div>
          </div>

          <fieldset className="field-group">
            <legend>
              <HeartPulse size={17} />
              剖腹情況
            </legend>
            <div className="delivery-options">
              {deliveryOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={input.delivery === option.value ? "selected" : ""}
                  onClick={() => update("delivery", option.value)}
                >
                  <span>{option.label}</span>
                  <small>{option.hint}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="field-group">
            <legend>
              <CalendarClock size={17} />
              手術時段
            </legend>
            <div className="segmented timing">
              {timingOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={input.timing === option.value ? "selected" : ""}
                  onClick={() => update("timing", option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="dual-steppers">
            <label>
              <span>
                <ClipboardList size={17} />
                住院日數
              </span>
              <Stepper
                value={input.stayDays}
                min={3}
                max={10}
                suffix="日"
                onChange={(value) => update("stayDays", value)}
              />
            </label>
            <label>
              <span>
                <Baby size={17} />
                BB數目
              </span>
              <Stepper
                value={input.babyCount}
                min={1}
                max={3}
                suffix="名"
                onChange={(value) => update("babyCount", value)}
              />
            </label>
          </div>

          <div className="section-rule" />

          <div className="intro-line compact">
            <span>03</span>
            <div>
              <h2>額外預留</h2>
              <p>媽媽與BB延遲出院會分開計算。</p>
            </div>
          </div>

          <div className="dual-steppers">
            <label>
              <span>媽媽額外留院</span>
              <Stepper
                value={input.extraMotherNights}
                min={0}
                max={7}
                suffix="晚"
                onChange={(value) => update("extraMotherNights", value)}
              />
            </label>
            <label>
              <span>BB額外留院</span>
              <Stepper
                value={input.extraBabyNights}
                min={0}
                max={14}
                suffix="晚"
                onChange={(value) => update("extraBabyNights", value)}
              />
            </label>
          </div>

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={input.jaundiceReserve}
              onChange={(event) => update("jaundiceReserve", event.target.checked)}
            />
            <span className="toggle" aria-hidden="true" />
            <span>
              <strong>預留BB黃疸／額外護理</strong>
              <small>加入通用風險範圍，不代表院方報價</small>
            </span>
          </label>

          <label className="range-field">
            <span>
              <span>雜費及突發預備金</span>
              <strong>{input.contingencyPercent}%</strong>
            </span>
            <input
              type="range"
              min="5"
              max="20"
              step="1"
              value={input.contingencyPercent}
              onChange={(event) => update("contingencyPercent", Number(event.target.value))}
            />
          </label>

          {!result.selectedPackage?.professionalIncluded && (
            <details className="quote-panel">
              <summary>
                <span>
                  <Stethoscope size={18} />
                  已有醫生報價？可提高準確度
                </span>
                <ChevronDown size={18} />
              </summary>
              <div className="quote-grid">
                <CurrencyInput
                  label="產科醫生手術費"
                  value={input.professionalQuote.obstetrician}
                  onChange={(value) => updateQuote("obstetrician", value)}
                />
                <CurrencyInput
                  label="麻醉師費"
                  value={input.professionalQuote.anaesthetist}
                  onChange={(value) => updateQuote("anaesthetist", value)}
                />
                <CurrencyInput
                  label="產科醫生巡房"
                  suffix="/ 日"
                  value={input.professionalQuote.obstetricianRoundPerDay}
                  onChange={(value) => updateQuote("obstetricianRoundPerDay", value)}
                />
                <CurrencyInput
                  label="兒科醫生巡房"
                  suffix="/ BB / 日"
                  value={input.professionalQuote.paediatricianRoundPerBabyDay}
                  onChange={(value) => updateQuote("paediatricianRoundPerBabyDay", value)}
                />
              </div>
            </details>
          )}
        </section>

        <aside className="result-pane" aria-live="polite">
          <div className="result-sticky">
            <div className="estimate-heading">
              <div>
                <span className="eyebrow">預計總埋單</span>
                <h2>
                  {money.format(result.low)}
                  <span>至</span>
                  {money.format(result.high)}
                </h2>
              </div>
              <div className={`confidence-badge ${result.confidence}`}>
                <ShieldCheck size={17} />
                <span>
                  可信度
                  <strong>{result.confidenceLabel}</strong>
                </span>
              </div>
            </div>

            <div className="likely-total">
              <span>較可能預算</span>
              <strong>{money.format(result.base)}</strong>
              <small>建議以此數再核對醫生正式報價</small>
            </div>

            <div className="three-point">
              <div>
                <span>低位</span>
                <strong>{money.format(result.low)}</strong>
              </div>
              <div className="active">
                <span>較可能</span>
                <strong>{money.format(result.base)}</strong>
              </div>
              <div>
                <span>高位</span>
                <strong>{money.format(result.high)}</strong>
              </div>
            </div>

            <div className="subtotal-strip">
              <div>
                <Building2 size={16} />
                <span>院方</span>
                <strong>{money.format(result.hospitalSubtotal.base)}</strong>
              </div>
              <div>
                <Stethoscope size={16} />
                <span>專業費</span>
                <strong>{money.format(result.professionalSubtotal.base)}</strong>
              </div>
              <div>
                <Baby size={16} />
                <span>BB</span>
                <strong>{money.format(result.babySubtotal.base)}</strong>
              </div>
              <div>
                <CircleDollarSign size={16} />
                <span>預備金</span>
                <strong>{money.format(result.reserveSubtotal.base)}</strong>
              </div>
            </div>

            <section className="breakdown-section">
              <div className="result-section-title">
                <h3>費用明細</h3>
                <span>{result.breakdown.length} 項</span>
              </div>
              <div className="breakdown-table">
                {result.breakdown.map((item) => (
                  <div className="breakdown-row" key={item.id}>
                    <div className="breakdown-copy">
                      <div className="breakdown-label-row">
                        <strong>{item.label}</strong>
                        <span className={`source-tag ${item.source}`}>
                          {sourceLabels[item.source]}
                        </span>
                      </div>
                      <span className="breakdown-detail">{item.detail}</span>
                    </div>
                    <div className="amount">
                      <strong>{money.format(item.base)}</strong>
                      {item.low !== item.high && (
                        <span>
                          {money.format(item.low)}–{money.format(item.high)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {result.warnings.length > 0 && (
              <section className="warning-section">
                <div className="result-section-title">
                  <h3>
                    <AlertTriangle size={17} />
                    仍未確定
                  </h3>
                  <span>最大變數：{result.largestUncertainty}</span>
                </div>
                <ul>
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            )}

            {result.cases.length > 0 && (
              <details className="case-section">
                <summary>
                  <span>
                    <ReceiptText size={17} />
                    公開案例參考
                  </span>
                  <ChevronDown size={17} />
                </summary>
                <div>
                  {result.cases.map((item) => (
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer" key={item.id}>
                      <span>
                        {item.year} · {item.room}
                      </span>
                      <strong>{money.format(item.total)}</strong>
                      <ExternalLink size={14} />
                    </a>
                  ))}
                  <p>案例年份、醫生、房型及醫療情況不同，只作結果校準。</p>
                </div>
              </details>
            )}

            <section className="source-section">
              <div className="result-section-title">
                <h3>
                  <CheckCircle2 size={17} />
                  本次資料來源
                </h3>
              </div>
              <div className="source-links">
                {result.sourceUrls.map((url, index) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    來源 {index + 1}
                    <ExternalLink size={13} />
                  </a>
                ))}
              </div>
            </section>

            <div className="disclaimer">
              <Info size={16} />
              <p>{database.release.disclaimer} 最終收費以院方及醫療團隊結算為準。</p>
            </div>
          </div>
        </aside>
      </main>

      <footer>
        <span>資料版本 {database.release.version}</span>
        <span>不儲存你輸入的醫生報價</span>
      </footer>
    </div>
  );
}

export default App;
