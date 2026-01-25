type SteamAchievementSchema = {
    game?: {
      availableGameStats?: {
        achievements?: Array<{
          name: string;
          displayName?: string;
          description?: string;
          icon?: string;
          icongray?: string;
          hidden?: number;
        }>;
      };
    };
  };
  
  type SteamPlayerAchievements = {
    playerstats?: {
      achievements?: Array<{
        apiname: string;
        achieved: number; // 0/1
        unlocktime: number; // unix
      }>;
    };
  };
  
  function mustKey() {
    const key = process.env.STEAM_WEB_API_KEY;
    if (!key) throw new Error("Missing STEAM_WEB_API_KEY");
    return key;
  }
  
  async function fetchJson(url: string) {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(data?.error?.description || `Steam API failed (${res.status})`);
    return data;
  }
  
  export async function steamGetSchemaForGame(appid: number): Promise<SteamAchievementSchema> {
    const key = mustKey();
    const url = `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${encodeURIComponent(
      key
    )}&appid=${appid}`;
    return await fetchJson(url);
  }
  
  export async function steamGetPlayerAchievements(
    steamid64: string,
    appid: number
  ): Promise<SteamPlayerAchievements> {
    const key = mustKey();
    const url = `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${encodeURIComponent(
      key
    )}&steamid=${encodeURIComponent(steamid64)}&appid=${appid}`;
    return await fetchJson(url);
  }
  