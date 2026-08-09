import type { Metadata } from "next";
import Link from "next/link";
import { ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getLandingPath } from "@/lib/auth/landing";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = {
  title: "Yetkiniz yok",
};

export default async function UnauthorizedPage() {
  const viewer = await getViewer();
  // Offer a way back to a page this user can actually open.
  const backHref = viewer ? getLandingPath(viewer) : "/login";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <ShieldOff className="size-6 text-muted-foreground" />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold tracking-tight">
            Bu sayfaya erişiminiz yok
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Bu bölüm için yetkiniz tanımlı değil. İhtiyacınız varsa sistem
            yöneticinizden talep edebilirsiniz. Hangi yetkilere sahip olduğunuzu
            Ayarlar sayfasından görebilirsiniz.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>{viewer ? "Geri dön" : "Giriş yap"}</Link>
        </Button>
      </div>
    </main>
  );
}
