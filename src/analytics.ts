type AnalyticsParameter = string | number | boolean | undefined;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (
      command: "event",
      eventName: string,
      parameters?: Record<string, AnalyticsParameter>
    ) => void;
  }
}

const consentKey = "maternity-calc-analytics-consent";

export function setAnalyticsConsent(allowed: boolean) {
  localStorage.setItem(consentKey, allowed ? "granted" : "denied");
  if (!allowed || document.querySelector('script[data-analytics="google"]')) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = (command, eventName, parameters) =>
    window.dataLayer?.push([command, eventName, parameters]);
  window.dataLayer.push(["js", new Date()]);
  window.dataLayer.push(["config", "G-BKRW9RD853", { anonymize_ip: true }]);
  const script = document.createElement("script");
  script.async = true;
  script.dataset.analytics = "google";
  script.src = "https://www.googletagmanager.com/gtag/js?id=G-BKRW9RD853";
  document.head.appendChild(script);
  window.gtag("event", "consent_granted");
}

export function getAnalyticsConsent() {
  return typeof localStorage === "undefined" ? null : localStorage.getItem(consentKey);
}

export function trackEvent(
  eventName: string,
  parameters: Record<string, AnalyticsParameter> = {}
) {
  if (getAnalyticsConsent() !== "granted") return;
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  window.gtag("event", eventName, parameters);
}
