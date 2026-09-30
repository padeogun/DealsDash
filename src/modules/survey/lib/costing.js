import { CHECKLIST, NONE } from "../data/checklist.js";
import { geom } from "./geometry.js";

/* answers: { [itemId]: { action, qty, override, note, confirmed, source } }
   Returns priced lines for every item whose action is not "none". */
export function priceSurvey(property, answers, rates) {
  const g = geom(property);
  const lines = [];
  for (const sec of CHECKLIST) for (const it of sec.items) {
    const a = answers?.[it.id] || {};
    const act = it.actions.find((x) => x.id === a.action);
    if (!act || act.id === "none") continue;
    const calc = Math.round(act.cost(property, g, rates, +a.qty || 0));
    const quoted = a.override !== "" && a.override != null && !Number.isNaN(+a.override);
    lines.push({
      id: it.id, section: sec.title, zone: sec.zone, label: it.label, actionId: act.id, action: act.label,
      calc, cost: quoted ? Math.round(+a.override) : calc, quoted, note: a.note || "",
      confirmed: a.confirmed !== false, source: a.source || "site",
    });
  }
  const total = lines.reduce((s, l) => s + l.cost, 0);
  const unconfirmed = lines.filter((l) => !l.confirmed).length;
  return { g, lines, total, unconfirmed };
}

export const findItem = (id) => { for (const s of CHECKLIST) for (const it of s.items) if (it.id === id) return it; return null; };
export const actionFor = (item, answers) => item.actions.find((x) => x.id === answers?.[item.id]?.action) || NONE;
