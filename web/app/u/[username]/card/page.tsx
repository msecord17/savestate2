import { redirect, permanentRedirect } from "next/navigation";

/**
 * /u/[username]/card — backwards-compatible alias.
 * 308 permanent redirect to canonical /users/[username]/card.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const trimmed = username?.trim();
  if (!trimmed) redirect("/");
  permanentRedirect(`/users/${encodeURIComponent(trimmed)}/card`);
}
