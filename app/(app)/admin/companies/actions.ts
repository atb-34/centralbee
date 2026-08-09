"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { can, getViewer } from "@/lib/auth/viewer";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { InstitutionStatus } from "@/types/database";

export type FormState = { error?: string; ok?: boolean };

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,15}$/;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

// -----------------------------------------------------------------------------
// Companies
// -----------------------------------------------------------------------------

export async function saveCompanyAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const viewer = await getViewer();
  if (!can(viewer, permission(MODULES.adminCompanies, "manage"))) {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const id = optionalText(formData, "id");
  const code = text(formData, "code").toUpperCase();
  const name = text(formData, "name");
  const legalName = optionalText(formData, "legal_name");
  const salaryDayRaw = text(formData, "default_salary_payment_day");

  if (!name) return { error: "Şirket adı gerekli." };
  if (!CODE_PATTERN.test(code)) {
    return {
      error: "Kod 1-16 karakter olmalı; büyük harf, rakam, alt çizgi ve tire.",
    };
  }

  let salaryDay: number | null = null;
  if (salaryDayRaw) {
    const parsed = Number(salaryDayRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
      return { error: "Maaş ödeme günü 1 ile 31 arasında olmalı." };
    }
    salaryDay = parsed;
  }

  const supabase = await createSupabaseServerClient();

  const payload = {
    code,
    name,
    legal_name: legalName,
    default_salary_payment_day: salaryDay,
    is_active: formData.get("is_active") === "on",
  };

  const { error } = id
    ? await supabase.from("companies").update(payload).eq("id", id)
    : await supabase.from("companies").insert(payload);

  if (error) {
    if (error.code === "23505") {
      return { error: `"${code}" kodu başka bir şirkette kullanılıyor.` };
    }
    return { error: `Kaydedilemedi: ${error.message}` };
  }

  await recordAudit({
    actorId: viewer!.id,
    actorUsername: viewer!.profile.username,
    action: id ? "update" : "create",
    entityType: "company",
    entityId: id,
    summary: id ? `Şirket güncellendi: ${name}` : `Şirket oluşturuldu: ${name}`,
    newValue: payload,
  });

  revalidatePath("/admin/companies");
  revalidatePath("/institutions");
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Institutions
// -----------------------------------------------------------------------------

const INSTITUTION_STATUSES: InstitutionStatus[] = ["active", "paused", "closed"];

export async function saveInstitutionAction(
  _previous: FormState,
  formData: FormData
): Promise<FormState> {
  const viewer = await getViewer();
  if (!can(viewer, permission(MODULES.adminInstitutions, "manage"))) {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const id = optionalText(formData, "id");
  const companyId = text(formData, "company_id");
  const code = text(formData, "code").toUpperCase();
  const name = text(formData, "name");
  const status = text(formData, "status") as InstitutionStatus;

  if (!companyId) return { error: "Şirket seçilmeli." };
  if (!name) return { error: "Kurum adı gerekli." };
  if (!CODE_PATTERN.test(code)) {
    return {
      error: "Kod 1-16 karakter olmalı; büyük harf, rakam, alt çizgi ve tire.",
    };
  }
  if (!INSTITUTION_STATUSES.includes(status)) {
    return { error: "Geçersiz durum." };
  }

  const supabase = await createSupabaseServerClient();

  const payload = {
    company_id: companyId,
    code,
    name,
    short_name: optionalText(formData, "short_name"),
    institution_type: optionalText(formData, "institution_type"),
    city: optionalText(formData, "city"),
    district: optionalText(formData, "district"),
    manager_profile_id: optionalText(formData, "manager_profile_id"),
    status,
  };

  const { error } = id
    ? await supabase.from("institutions").update(payload).eq("id", id)
    : await supabase.from("institutions").insert(payload);

  if (error) {
    if (error.code === "23505") {
      return { error: `"${code}" kodu bu şirkette zaten kullanılıyor.` };
    }
    return { error: `Kaydedilemedi: ${error.message}` };
  }

  await recordAudit({
    actorId: viewer!.id,
    actorUsername: viewer!.profile.username,
    action: id ? "update" : "create",
    entityType: "institution",
    entityId: id,
    summary: id ? `Kurum güncellendi: ${name}` : `Kurum oluşturuldu: ${name}`,
    newValue: payload,
  });

  revalidatePath("/admin/companies");
  revalidatePath("/institutions");
  return { ok: true };
}
