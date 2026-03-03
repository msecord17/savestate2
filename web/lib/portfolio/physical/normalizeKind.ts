// lib/portfolio/physical/normalizeKind.ts
export type PhysicalKind = "game" | "system" | "accessory" | "other";

const KIND_ALIASES: Record<string, PhysicalKind> = {
  // canonical
  game: "game",
  system: "system",
  accessory: "accessory",
  other: "other",

  // common synonyms
  console: "system",
  hardware: "system",
  device: "system",
  handheld: "system",

  controller: "accessory",
  gamepad: "accessory",
  pad: "accessory",
  joystick: "accessory",
  peripheral: "accessory",
  cable: "accessory",
  cords: "accessory",
  dock: "accessory",
  charger: "accessory",
  headset: "accessory",
};

function clean(s: string) {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeKind(input: unknown): PhysicalKind {
  if (input == null) return "game"; // default hard
  if (typeof input !== "string") return "game";

  const k = clean(input);

  // If someone sends "video_game" or "games"
  if (k === "games" || k === "video_game" || k === "videogame") return "game";
  if (k === "consoles" || k === "video_game_console") return "system";

  return KIND_ALIASES[k] ?? "game"; // fail closed to "game"
}

export function isValidKind(k: string): k is PhysicalKind {
  return k === "game" || k === "system" || k === "accessory" || k === "other";
}
