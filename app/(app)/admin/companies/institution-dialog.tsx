"use client";

import * as React from "react";

import { Field, FormDialog } from "@/components/app/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveInstitutionAction } from "./actions";
import type { InstitutionRow } from "@/types/database";

type CompanyOption = { id: string; name: string; code: string };
type ManagerOption = { id: string; full_name: string };

export function InstitutionDialog({
  trigger,
  companies,
  managers,
  institution,
  defaultCompanyId,
}: {
  trigger: React.ReactNode;
  companies: CompanyOption[];
  managers: ManagerOption[];
  institution?: Pick<
    InstitutionRow,
    | "id"
    | "company_id"
    | "code"
    | "name"
    | "short_name"
    | "institution_type"
    | "city"
    | "district"
    | "status"
    | "manager_profile_id"
  >;
  defaultCompanyId?: string;
}) {
  const editing = Boolean(institution);

  // Radix Select does not post a value on its own, so the chosen option is
  // mirrored into a hidden input that the form action reads.
  const [companyId, setCompanyId] = React.useState(
    institution?.company_id ?? defaultCompanyId ?? companies[0]?.id ?? ""
  );
  const [managerId, setManagerId] = React.useState(
    institution?.manager_profile_id ?? ""
  );
  const [status, setStatus] = React.useState<string>(institution?.status ?? "active");

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Kurumu düzenle" : "Yeni kurum"}
      description="Okul, kurs veya kampüs. Her kurum bir şirkete bağlıdır."
      action={saveInstitutionAction}
    >
      {institution ? <input type="hidden" name="id" value={institution.id} /> : null}
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="manager_profile_id" value={managerId} />
      <input type="hidden" name="status" value={status} />

      <Field label="Kurum adı" wide>
        <Input name="name" defaultValue={institution?.name ?? ""} required />
      </Field>

      <Field label="Şirket">
        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger>
            <SelectValue placeholder="Seçin" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Kod" hint="Şirket içinde benzersiz.">
        <Input
          name="code"
          defaultValue={institution?.code ?? ""}
          required
          className="font-mono uppercase"
        />
      </Field>

      <Field label="Kısa ad" hint="Dar tablolarda kullanılır.">
        <Input name="short_name" defaultValue={institution?.short_name ?? ""} />
      </Field>

      <Field label="Tür" hint="Örn. Kolej, Kurs, Kampüs">
        <Input
          name="institution_type"
          defaultValue={institution?.institution_type ?? ""}
        />
      </Field>

      <Field label="Şehir">
        <Input name="city" defaultValue={institution?.city ?? ""} />
      </Field>

      <Field label="İlçe">
        <Input name="district" defaultValue={institution?.district ?? ""} />
      </Field>

      <Field label="Müdür">
        <Select value={managerId || "none"} onValueChange={(v) => setManagerId(v === "none" ? "" : v)}>
          <SelectTrigger>
            <SelectValue placeholder="Seçin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Atanmadı</SelectItem>
            {managers.map((manager) => (
              <SelectItem key={manager.id} value={manager.id}>
                {manager.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Durum">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="paused">Duraklatıldı</SelectItem>
            <SelectItem value="closed">Kapalı</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </FormDialog>
  );
}
