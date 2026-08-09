"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle } from "lucide-react";

import { createFirstAdminAction, type SetupState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" />
          Oluşturuluyor
        </>
      ) : (
        "Yöneticiyi oluştur"
      )}
    </Button>
  );
}

export function SetupForm() {
  const [state, formAction] = useActionState<SetupState, FormData>(
    createFirstAdminAction,
    {}
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="full_name">Ad soyad</Label>
        <Input id="full_name" name="full_name" required autoFocus />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Kullanıcı adı</Label>
        <Input
          id="username"
          name="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
        <p className="text-xs text-muted-foreground">
          Giriş yaparken bunu yazacaksınız. Küçük harf, rakam, nokta ve tire.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-posta (isteğe bağlı)</Label>
        <Input id="email" name="email" type="email" autoComplete="email" />
        <p className="text-xs text-muted-foreground">
          Giriş için kullanılmaz; yalnızca kayıt amaçlıdır.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Şifre</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
        <p className="text-xs text-muted-foreground">En az 10 karakter.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password_confirm">Şifre tekrar</Label>
        <Input
          id="password_confirm"
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical/35 bg-critical-subtle px-3 py-2 text-[13px] text-critical"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
