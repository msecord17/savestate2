// lib/platforms.ts
export function normalizePlatformLabel(raw: string) {
  const s = String(raw || "").toUpperCase().trim();

  // PSN: Sony trophy API commonly returns these
  if (s.includes("PS5")) return "PS5";
  if (s.includes("PS4")) return "PS4";
  if (s.includes("PS3")) return "PS3";
  if (s.includes("PS2")) return "PS2";
  if (s.includes("PS1") || s.includes("PSX")) return "PS1";
  if (s.includes("PSP")) return "PSP";
  if (s.includes("VITA")) return "Vita";

  // Common “already normalized”
  if (s === "PLAYSTATION 5") return "PS5";
  if (s === "PLAYSTATION 4") return "PS4";
  if (s === "PLAYSTATION 3") return "PS3";
  if (s === "PLAYSTATION 2") return "PS2";
  if (s === "PLAYSTATION") return "PlayStation";

  // Fallback: keep it readable but not null
  // (this helps you spot weird inputs like "PS5,PS4")
  return raw?.trim() || "PlayStation";
}
