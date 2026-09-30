// Global rule: if a metric lacks sufficient data, return "Not available" or
// "Unscored — <reason>" rather than silently substituting a default.
// Where an estimate is deliberately used, isIllustrative: true marks it for
// the † footnote rendered by BriefStatCell / BriefTableRow.

export function displayMetric(metric) {
  if (metric === null || metric === undefined) {
    return { text: "Not available", available: false, illustrative: false };
  }
  if (typeof metric === "object") {
    if (metric.notAvailable) {
      return {
        text: metric.reason ? `Unscored — ${metric.reason}` : "Not available",
        available: false,
        illustrative: false,
      };
    }
    if (metric.value !== undefined && metric.value !== null) {
      return {
        text: metric.value,
        available: true,
        illustrative: !!metric.isIllustrative,
        source: metric.source ?? null,
        retrievedAt: metric.retrievedAt ?? null,
      };
    }
    return { text: "Not available", available: false, illustrative: false };
  }
  return { text: String(metric), available: true, illustrative: false };
}
