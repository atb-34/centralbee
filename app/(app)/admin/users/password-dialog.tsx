"use client";

import * as React from "react";

import { resetPasswordAction } from "./actions";
import { Field, FormDialog } from "@/components/app/form-dialog";
import { Input } from "@/components/ui/input";

export function PasswordDialog({
  trigger,
  userId,
  username,
}: {
  trigger: React.ReactNode;
  userId: string;
  username: string;
}) {
  return (
    <FormDialog
      trigger={trigger}
      title="Şifre sıfırla"
      description={`@${username} için yeni bir şifre belirleyin ve kullanıcıya kendiniz iletin.`}
      action={resetPasswordAction}
      submitLabel="Şifreyi değiştir"
    >
      <input type="hidden" name="id" value={userId} />

      <Field label="Yeni şifre" wide hint="En az 10 karakter.">
        <Input name="password" type="password" required minLength={10} />
      </Field>

      <Field label="Yeni şifre tekrar" wide>
        <Input name="password_confirm" type="password" required minLength={10} />
      </Field>
    </FormDialog>
  );
}
