import type { Metadata } from "next";
import Link from "next/link";
import { ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Yetkiniz yok",
};

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <ShieldOff className="size-6 text-muted-foreground" />
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-semibold tracking-tight">Bu sayfaya erişiminiz yok</h1>
          <p className="text-[13px] text-muted-foreground">
            Bu bölüm için yetkiniz tanımlı değil. İhtiyacınız varsa sistem
            yöneticinizden talep edebilirsiniz.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/daily">Günlük sayfasına dön</Link>
        </Button>
      </div>
    </main>
  );
}
