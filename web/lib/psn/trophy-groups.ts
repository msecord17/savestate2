export async function getUserTrophyGroupsForTitle(
    accessToken: string,
    accountId: string,
    npCommunicationId: string
  ) {
    // PSN trophy groups endpoint (works for most titles that expose trophies)
    // NOTE: This relies on your existing PSN auth/token plumbing.
    const url =
      `https://m.np.playstation.com/api/trophy/v1/users/${encodeURIComponent(accountId)}` +
      `/npCommunicationIds/${encodeURIComponent(npCommunicationId)}` +
      `/trophyGroups?npServiceName=trophy`;
  
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Language": "en-US",
      },
      cache: "no-store",
    });
  
    if (!res.ok) {
      // Don’t hard-fail the whole sync for one title
      return [];
    }
  
    const json = await res.json();
    return Array.isArray(json?.trophyGroups) ? json.trophyGroups : [];
  }
  