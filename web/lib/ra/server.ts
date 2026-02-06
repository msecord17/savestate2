// web/lib/ra/server.ts
import { buildAuthorization, getGameInfoAndUserProgress } from "@retroachievements/api";

export function raAuth(ra_username: string, ra_api_key: string) {
  return buildAuthorization({ username: ra_username, webApiKey: ra_api_key });
}

export async function raGetGameInfoAndUserProgress(
  ra_username: string,
  ra_api_key: string,
  gameId: number
) {
  const authorization = raAuth(ra_username, ra_api_key);

  // This returns: game metadata + achievements + dateEarned/dateEarnedHardcore per achievement if earned
  return await getGameInfoAndUserProgress(authorization, {
    username: ra_username,
    gameId,
  });
}

export async function raSearchGamesByTitle(username: string, apiKey: string, title: string) {
  const params = new URLSearchParams({
    z: username,
    y: apiKey,
    t: title,
  });

  // RA Web API endpoint (search by title)
  // Docs call this API_SearchGames
  const url = `https://retroachievements.org/API/API_SearchGames.php?${params.toString()}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`RA search failed (${res.status})`);
  const data = await res.json();

  // normalize shape a bit
  return Array.isArray(data)
    ? data.map((g: any) => ({
        id: Number(g.ID ?? g.GameID ?? g.id),
        title: g.Title ?? g.GameTitle ?? g.title ?? "",
        console: g.ConsoleName ?? g.Console ?? "",
        imageIcon: g.ImageIcon ?? g.imageIcon ?? null,
      }))
    : [];
}
