// web/lib/psn/server.ts
import type { AuthorizationPayload } from "psn-api";
import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  makeUniversalSearch,
  getUserTitles,
  getUserPlayedGames as psnApiGetUserPlayedGames,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
} from "psn-api";

/**
 * Turn an NPSSO token into an AuthorizationPayload used by psn-api.
 * NPSSO is the “cookie token” users paste in during connect.
 */
export async function psnAuthorizeFromNpsso(npsso: string): Promise<AuthorizationPayload> {
  const token = (npsso || "").trim();
  if (!token) throw new Error("Missing NPSSO");

  const accessCode = await exchangeNpssoForAccessCode(token);
  const authorization = await exchangeAccessCodeForAuthTokens(accessCode);

  return authorization;
}

/**
 * Look up a user's accountId from their onlineId (PSN username).
 * Many PSN endpoints require accountId instead of onlineId.
 */
export async function psnAccountIdFromOnlineId(
  authorization: AuthorizationPayload,
  onlineId: string
): Promise<string> {
  const q = (onlineId || "").trim();
  if (!q) throw new Error("Missing PSN onlineId");

  const res = await makeUniversalSearch(authorization, q, "SocialAllAccounts");
  const accountId =
    res?.domainResponses?.[0]?.results?.[0]?.socialMetadata?.accountId ?? null;

  if (!accountId) throw new Error("Could not resolve accountId from onlineId");
  return accountId;
}

/**
 * Get the user's trophy title list (this includes per-title trophy counts / earned counts).
 * This is the “missing trophy progress” piece.
 */
export async function psnGetUserTitles(
  authorization: AuthorizationPayload,
  accountId: string
) {
  return await getUserTitles(authorization, accountId);
}

/**
 * OPTIONAL (Step 5-ish): Pull detailed trophies for a title and merge with earned trophies.
 * You may not need this yet if you only want per-title totals/progress.
 */
export async function psnGetTitleTrophyDetails(
  authorization: AuthorizationPayload,
  accountId: string,
  npCommunicationId: string,
  trophyTitlePlatform: string
) {
  const isPs5 = String(trophyTitlePlatform || "").toUpperCase().includes("PS5");

  const opts = {
    npServiceName: (isPs5 ? "trophy2" : "trophy") as "trophy" | "trophy2",
  };

  const { trophies: titleTrophies } = await getTitleTrophies(
    authorization,
    npCommunicationId,
    "all",
    opts
  );

  const { trophies: earnedTrophies } = await getUserTrophiesEarnedForTitle(
    authorization,
    accountId,
    npCommunicationId,
    "all",
    opts
  );

  return { titleTrophies, earnedTrophies };
}

// ============================================================================
// Wrapper functions for sync route compatibility
// ============================================================================

/**
 * Get access token string from NPSSO (for sync route)
 */
export async function getPsnAccessTokenFromNpsso(npsso: string): Promise<string | null> {
  try {
    const auth = await psnAuthorizeFromNpsso(npsso);
    return auth.accessToken;
  } catch (e) {
    return null;
  }
}

/**
 * Get account ID from access token and onlineId (for sync route)
 */
export async function getPsnAccountId(
  accessToken: string,
  onlineId: string
): Promise<string | null> {
  try {
    const authorization = { accessToken } as any;
    const q = (onlineId || "").trim();
    if (!q) throw new Error("Missing PSN onlineId");

    const res = await makeUniversalSearch(authorization, q, "SocialAllAccounts");
    const accountId =
      res?.domainResponses?.[0]?.results?.[0]?.socialMetadata?.accountId ?? null;

    return accountId ? String(accountId) : null;
  } catch {
    return null;
  }
}

/**
 * Get user's played games (for sync route)
 */
export async function getUserPlayedGames(
  accessToken: string,
  accountId: string
): Promise<any[]> {
  const auth = { accessToken };
  const result = await psnApiGetUserPlayedGames(auth, accountId === "me" ? "me" : accountId);
  // getUserPlayedGames from psn-api returns { titles: [...] }
  return (result as any)?.titles || [];
}

/**
 * Get user's trophy titles with pagination (for sync route)
 */
export async function getUserTrophyTitlesPaged(
  accessToken: string,
  accountId: string
): Promise<any[]> {
  const auth = { accessToken };
  const result = await getUserTitles(auth, accountId === "me" ? "me" : accountId);
  // getUserTitles returns { trophyTitles: [...] }
  return (result as any)?.trophyTitles || [];
}

export { getUserTrophyGroupsForTitle } from "./trophy-groups";
