export function allocationLabel(strategy?: string | null) {
  switch (strategy) {
    case "FULL_POOL":
      return "Use full pool (extras drafted)";
    case "UNDRAFTED":
    default:
      return "Leave extras undrafted";
  }
}

export function scoringLabel(strategy?: string | null) {
  switch (strategy) {
    case "category_weighted":
      return "Category-weighted";
    case "negative":
      return "Negative";
    case "fixed":
    default:
      // User-facing: "fixed" is the standard scoring mode.
      return "Standard";
  }
}
