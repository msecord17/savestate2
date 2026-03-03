import { ShareCardPageClient } from "@/app/u/[username]/card/ShareCardPageClient";

export default async function Page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <ShareCardPageClient username={username ?? ""} />;
}
