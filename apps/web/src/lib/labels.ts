export function allocationLabel(strategy?: string | null) {
  switch (strategy) {
    case "FULL_POOL":
      return "Use full pool (extras drafted)";
    case "UNDRAFTED":
    default:
      return "Leave extras undrafted";
  }
}

