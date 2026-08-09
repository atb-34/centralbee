"use client";

import { Field, FormDialog } from "@/components/app/form-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { saveCompanyAction } from "./actions";
import type { CompanyRow } from "@/types/database";
import * as React from "react";

export function CompanyDialog({
  trigger,
  company,
}: {
  trigger: React.ReactNode;
  company?: Pick<
    CompanyRow,
    "id" | "code" | "name" | "legal_name" | "default_salary_payment_day" | "is_active"
  >;
}) {
  const editing = Boolean(company);

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Şirketi düzenle" : "Yeni şirket"}
      description="Kurumlar bir şirkete bağlıdır. Kod raporlarda kısaltma olarak kullanılır."
      action={saveCompanyAction}
    >
      {company ? <input type="hidden" name="id" value={company.id} /> : null}

      <Field label="Şirket adı" wide>
        <Input name="name" defaultValue={company?.name ?? ""} required />
      </Field>

      <Field label="Kod" hint="Örn. ATB, ABD">
        <Input
          name="code"
          defaultValue={company?.code ?? ""}
          required
          className="font-mono uppercase"
        />
      </Field>

      <Field label="Maaş ödeme günü" hint="Kurumlar bunu değiştirebilir.">
        <Input
          name="default_salary_payment_day"
          type="number"
          min={1}
          max={31}
          defaultValue={company?.default_salary_payment_day ?? ""}
        />
      </Field>

      <Field label="Ticari unvan" wide>
        <Input name="legal_name" defaultValue={company?.legal_name ?? ""} />
      </Field>

      <Field label="Durum" wide>
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox name="is_active" defaultChecked={company?.is_active ?? true} />
          Aktif
        </label>
      </Field>
    </FormDialog>
  );
}
