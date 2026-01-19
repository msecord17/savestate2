// lib/platforms.ts

export function normalizePlatformLabel(input: any): string | null {
    const raw = String(input ?? "").trim();
    if (!raw) return null;
  
    const s = raw.toUpperCase();
  
    // Generic / useless labels -> treat as unknown
    if (s === "PLAYSTATION" || s === "SONY" || s === "PS" || s === "PSN") return null;
  
    // Split multi-platform strings like "PS5,PS4" / "PS5 PS4" / "PS5/PS4"
    const parts = s
      .split(/[,/| ]+/g)
      .map((p) => p.trim())
      .filter(Boolean);
  
    const rank = (p: string) => {
      if (p === "PS5") return 100;
      if (p === "PS4") return 90;
      if (p === "PS3") return 80;
      if (p === "PS2") return 70;
      if (p === "PS1" || p === "PSX") return 60;
      if (p === "PSVITA" || p === "VITA") return 50;
      if (p === "PSP") return 40;
      if (p === "PSVR" || p === "PSVR2") return 30;
      return 0;
    };
  
    // Normalize common variants
    const norm = (p: string) => {
      if (p === "PSX") return "PS1";
      if (p === "VITA") return "Vita";
      if (p === "PSVITA") return "Vita";
      if (p === "PSVR2") return "PSVR2";
      if (p === "PSVR") return "PSVR";
      return p; // PS5, PS4, PS3, PS2, PS1, PSP
    };
  
    const best = parts
      .map((p) => p.replace(/[^A-Z0-9]/g, "")) // strip weird chars
      .sort((a, b) => rank(b) - rank(a))[0];
  
    if (!best || rank(best) === 0) return null;
    return norm(best);
  }
  