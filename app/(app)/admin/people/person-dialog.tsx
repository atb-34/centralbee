"use client";

import * as React from "react";

import { savePersonAction } from "@/app/(app)/operations/actions";
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
import type { PersonRow } from "@/types/database";

export function PersonDialog({
  trigger,
  institutions,
  person,
}: {
  trigger: React.ReactNode;
  institutions: { id: string; name: string }[];
  person?: PersonRow;
}) {
  const [institutionId, setInstitutionId] = React.useState(
    person?.institution_id ?? ""
  );

  return (
    <FormDialog
      trigger={trigger}
      title={person ? "Kişiyi düzenle" : "Yeni kişi"}
      description="Operasyonlarda sorumlu olarak seçilecek kişiler. Sisteme giriş yapmaları gerekmez — müteahhit, tedarikçi veya danışman da olabilir."
      action={savePersonAction}
    >
      {person ? <input type="hidden" name="id" value={person.id} /> : null}
      <input type="hidden" name="institution_id" value={institutionId} />

      <Field label="Ad soyad" wide>
        <Input name="full_name" defaultValue={person?.full_name ?? ""} required />
      </Field>

      <Field label="Ünvan / görev" hint="Örn. Teknik Sorumlu, Müteahhit">
        <Input name="role_title" defaultValue={person?.role_title ?? ""} />
      </Field>

      <Field label="Kurum" hint="Belirli bir kuruma bağlıysa.">
        <Select
          value={institutionId || "none"}
          onValueChange={(value) => setInstitutionId(value === "none" ? "" : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seçin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Bağlı değil</SelectItem>
            {institutions.map((institution) => (
              <SelectItem key={institution.id} value={institution.id}>
                {institution.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Telefon">
        <Input name="phone" defaultValue={person?.phone ?? ""} />
      </Field>

      <Field label="E-posta">
        <Input name="email" type="email" defaultValue={person?.email ?? ""} />
      </Field>

      <Field label="Durum" wide>
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox name="is_active" defaultChecked={person?.is_active ?? true} />
          Aktif — pasif kişiler sorumlu listesinde çıkmaz
        </label>
      </Field>
    </FormDialog>
  );
}
