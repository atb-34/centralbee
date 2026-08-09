import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetupForm } from "./setup-form";
import { setupIsAvailable } from "./actions";

export const metadata: Metadata = {
  title: "Kurulum",
};

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Closes itself permanently once the first account exists.
  if (!(await setupIsAvailable())) redirect("/login");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-brand">
              ◆
            </span>
            <span className="label-caps text-muted-foreground">CentralBee · Kurulum</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">İlk yöneticiyi oluşturun</h1>
          <p className="text-[13px] text-muted-foreground">
            Sistemde henüz hiç kullanıcı yok. Bu ekran yalnızca bir kez çalışır; ilk
            hesap oluşturulduktan sonra kendini kapatır.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <SetupForm />
        </div>
      </div>
    </main>
  );
}
