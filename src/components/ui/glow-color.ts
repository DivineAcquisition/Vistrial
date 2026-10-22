export type GlowColor = "brand" | "blue" | "purple" | "green" | "red" | "orange";

export type AgentAccentName = "brand" | "chart-2" | "info" | "chart-4" | "chart-3" | "neutral";

/** Agent accent keys already map onto brand, success, warning, and danger. */
export function glowColorForAccent(accent: AgentAccentName): GlowColor {
  switch (accent) {
    case "chart-2":
      return "green";
    case "chart-3":
      return "orange";
    case "chart-4":
      return "red";
    case "info":
      return "purple";
    default:
      return "brand";
  }
}
