"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { can, getViewer } from "@/lib/auth/viewer";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PeriodState = { error?: string; ok?: boolean };

/**
 * Switches the active education period.
 *
 * A partial unique index enforces one active row, so the previous period must
 * be cleared before the new one is set rather than in the same statement.
 */
export async function activatePeriodAction(
  _previous: PeriodState,
  formData: FormData
): Promise<PeriodState> {
  const viewer = await getViewer();
  if (!can(viewer, permission(MODULES.adminEducationPeriods, "manage"))) {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Dönem seçilmedi." };

  const supabase = await createSupabaseServerClient();

  const { data: target } = await supabase
    .from("education_periods")
    .select("id, short_name")
    .eq("id", id)
    .maybeSingle();

  if (!target) return { error: "Dönem bulunamadı." };

  const { error: clearError } = await supabase
    .from("education_periods")
    .update({ is_active: false })
    .eq("is_active", true);

  if (clearError) return { error: `Güncellenemedi: ${clearError.message}` };

  const { error } = await supabase
    .from("education_periods")
    .update({ is_active: true })
    .eq("id", id);

  if (error) return { error: `Güncellenemedi: ${error.message}` };

  await recordAudit({
    actorId: viewer!.id,
    actorUsername: viewer!.profile.username,
    action: "update",
    entityType: "education_period",
    entityId: id,
    summary: `Aktif eğitim dönemi ${target.short_name} olarak değiştirildi`,
  });

  revalidatePath("/admin/education-periods");
  revalidatePath("/daily");
  return { ok: true };
}
