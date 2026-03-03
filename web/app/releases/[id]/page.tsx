// app/releases/[id]/page.tsx
import { redirect } from "next/navigation";

export default function Page({ params }: { params: { id: string } }) {
  redirect(`/release/${params.id}`);
}
