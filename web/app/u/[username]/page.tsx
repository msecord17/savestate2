import { redirect } from "next/navigation";

export default async function LegacyU({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  redirect(`/users/${encodeURIComponent(username)}`);
}
