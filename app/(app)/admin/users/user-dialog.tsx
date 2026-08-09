"use client";

import * as React from "react";

import { createUserAction, updateUserAction } from "./actions";
import { Field, FormDialog } from "@/components/app/form-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InstitutionScope } from "@/types/database";

export type RoleOption = { id: string; key: string; name: string; description: string | null };
export type InstitutionOption = { id: string; name: string; companyName: string };

export type EditableUser = {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_active: boolean;
  institution_scope: InstitutionScope;
  roleIds: string[];
  institutionIds: string[];
};

export function UserDialog({
  trigger,
  roles,
  institutions,
  user,
}: {
  trigger: React.ReactNode;
  roles: RoleOption[];
  institutions: InstitutionOption[];
  user?: EditableUser;
}) {
  const editing = Boolean(user);
  const [scope, setScope] = React.useState<InstitutionScope>(
    user?.institution_scope ?? "specific"
  );

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Kullanıcıyı düzenle" : "Yeni kullanıcı"}
      description={
        editing
          ? "Kullanıcı adı değiştirilemez. Şifre için ayrı bir işlem kullanın."
          : "Kullanıcı giriş yaparken e-posta değil, kullanıcı adı yazacak."
      }
      action={editing ? updateUserAction : createUserAction}
    >
      {user ? <input type="hidden" name="id" value={user.id} /> : null}
      <input type="hidden" name="institution_scope" value={scope} />

      <Field label="Ad soyad" wide>
        <Input name="full_name" defaultValue={user?.full_name ?? ""} required />
      </Field>

      {editing ? (
        <Field label="Kullanıcı adı">
          <Input value={user?.username ?? ""} readOnly disabled className="font-mono" />
        </Field>
      ) : (
        <Field label="Kullanıcı adı" hint="Küçük harf, rakam, nokta, tire.">
          <Input
            name="username"
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="font-mono"
          />
        </Field>
      )}

      {editing ? (
        <Field label="Ünvan">
          <Input name="title" defaultValue={user?.title ?? ""} />
        </Field>
      ) : (
        <Field label="Şifre" hint="En az 10 karakter. Kullanıcıya siz iletirsiniz.">
          <Input name="password" type="password" required minLength={10} />
        </Field>
      )}

      <Field label="E-posta" hint="Giriş için kullanılmaz.">
        <Input name="email" type="email" defaultValue={user?.email ?? ""} />
      </Field>

      <Field label="Telefon">
        <Input name="phone" defaultValue={user?.phone ?? ""} />
      </Field>

      {!editing ? (
        <Field label="Ünvan" wide>
          <Input name="title" />
        </Field>
      ) : null}

      <Field label="Roller" wide hint="Rol, yetki demetidir. Birden fazla seçilebilir.">
        <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
          {roles.map((role) => (
            <label key={role.id} className="flex items-start gap-2.5 text-[13px]">
              <Checkbox
                name="role_ids"
                value={role.id}
                defaultChecked={user?.roleIds.includes(role.id)}
                className="mt-0.5"
              />
              <span className="flex flex-col">
                <span className="font-medium">{role.name}</span>
                {role.description ? (
                  <span className="text-xs text-muted-foreground">
                    {role.description}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Kurum erişimi" wide>
        <Select value={scope} onValueChange={(value) => setScope(value as InstitutionScope)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tüm kurumlar</SelectItem>
            <SelectItem value="specific">Seçili kurumlar</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {scope === "specific" ? (
        <Field
          label="Erişebileceği kurumlar"
          wide
          hint="Seçilmeyen kurumların verisi bu kullanıcıya hiç dönmez."
        >
          {institutions.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-3 text-[13px] text-muted-foreground">
              Henüz kurum tanımlanmamış.
            </p>
          ) : (
            <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto rounded-md border border-border p-3">
              {institutions.map((institution) => (
                <label
                  key={institution.id}
                  className="flex items-center gap-2.5 text-[13px]"
                >
                  <Checkbox
                    name="institution_ids"
                    value={institution.id}
                    defaultChecked={user?.institutionIds.includes(institution.id)}
                  />
                  <span>
                    {institution.name}
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {institution.companyName}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </Field>
      ) : null}

      {editing ? (
        <Field label="Hesap durumu" wide>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox name="is_active" defaultChecked={user?.is_active ?? true} />
            Aktif — kapatılırsa kullanıcı giriş yapamaz
          </label>
        </Field>
      ) : null}
    </FormDialog>
  );
}
