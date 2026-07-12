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

export function trackEvent(
  eventName: string,
  parameters: Record<string, AnalyticsParameter> = {}
) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;

  window.gtag("event", eventName, parameters);
}

