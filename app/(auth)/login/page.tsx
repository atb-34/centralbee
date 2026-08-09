import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "./login-form";
import { getLandingPath } from "@/lib/auth/landing";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = {
  title: "Giriş",
};

export default async function LoginPage() {
  const viewer = await getViewer();
  if (viewer) redirect(getLandingPath(viewer));

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-brand">
              ◆
            </span>
            <span className="label-caps text-muted-foreground">CentralBee</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Yönetim sistemi</h1>
          <p className="text-[13px] text-muted-foreground">
            Devam etmek için kullanıcı adınızla giriş yapın.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Şifrenizi bilmiyorsanız sistem yöneticinizle görüşün.
        </p>
      </div>
    </main>
  );
}
