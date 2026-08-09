import { redirect } from "next/navigation";

import { getLandingPath } from "@/lib/auth/landing";
import { getViewer } from "@/lib/auth/viewer";

export default async function RootPage() {
  const viewer = await getViewer();
  redirect(viewer ? getLandingPath(viewer) : "/login");
}
