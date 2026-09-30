// Pipeline stage config for the sourcing-to-exit kanban.
// No React or Firebase imports — pure config consumed by App.jsx.

export const SOURCING_STAGES = [
  "Watching",
  "Viewing",
  "Legal Review",
  "Due Diligence",
  "Bid Ready",
  "Bid Submitted",
  "Won",
];

export const TERMINAL_STAGES = ["Lost", "Withdrawn"];

export const DEAL_STAGES = [
  "Purchased", "Refurb", "Marketing", "Exit (Sold)", "Exit (Refinanced)",
];

// Stages that trigger a triage gate check before advancing
export const GATED_STAGES = new Set(["Bid Ready"]);

// Token-based colour class sets per stage — dark-mode safe.
export const STAGE_COLORS = {
  "Watching":          { bg: "bg-vx-surface-2",       text: "text-vx-muted"         },
  "Viewing":           { bg: "bg-vx-surface-info",    text: "text-vx-info"          },
  "Legal Review":      { bg: "bg-vx-surface-caution", text: "text-vx-caution"       },
  "Due Diligence":     { bg: "bg-vx-surface-caution", text: "text-vx-caution"       },
  "Bid Ready":         { bg: "bg-vx-surface-positive",text: "text-vx-positive"      },
  "Bid Submitted":     { bg: "bg-vx-surface",         text: "text-vx-accent-strong" },
  "Won":               { bg: "bg-vx-surface-positive",text: "text-vx-positive"      },
  "Lost":              { bg: "bg-vx-surface-negative",text: "text-vx-negative"      },
  "Withdrawn":         { bg: "bg-vx-surface-2",       text: "text-vx-muted"         },
  "Purchased":         { bg: "bg-vx-surface",         text: "text-vx-accent"        },
  "Refurb":            { bg: "bg-vx-surface-caution", text: "text-vx-caution"       },
  "Marketing":         { bg: "bg-vx-surface",         text: "text-vx-text"          },
  "Exit (Sold)":       { bg: "bg-vx-surface-positive",text: "text-vx-positive"      },
  "Exit (Refinanced)": { bg: "bg-vx-surface-positive",text: "text-vx-positive"      },
};

// Legacy lead.status → pipelineStage (applied at runtime; no migration write needed)
export const LEAD_STATUS_TO_STAGE = {
  "new":         "Watching",
  "watchlist":   "Watching",
  "under_offer": "Bid Submitted",
  "rejected":    "Lost",
  "promoted":    "Won",
};

// Legacy deal.status → pipelineStage
export const DEAL_STATUS_TO_STAGE = {
  "Prospecting":        "Watching",
  "Under Offer":        "Bid Submitted",
  "Refurbishment":      "Refurb",
  "Marketing":          "Marketing",
  "Sold":               "Exit (Sold)",
  "Let / Held (BRRR)":  "Exit (Refinanced)",
  "Rejected":           "Lost",
};
