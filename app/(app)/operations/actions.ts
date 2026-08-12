"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { can, getViewer } from "@/lib/auth/viewer";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OperationPriority, OperationStatus } from "@/types/database";

export type OperationState = { error?: string; ok?: boolean };

const PRIORITIES: OperationPriority[] = ["critical", "high", "medium", "low"];
const STATUSES: OperationStatus[] = [
  "not_started",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
  "cancelled",
];

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function parseMoney(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, "");
  const normalised = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/\.(?=\d{3}\b)/g, "");
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

export async function saveOperationAction(
  _previous: OperationState,
  formData: FormData
): Promise<OperationState> {
  const viewer = await getViewer();
  const id = optionalText(formData, "id");

  const needed = id
    ? permission(MODULES.operations, "edit")
    : permission(MODULES.operations, "create");

  if (!can(viewer, needed)) {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const institutionId = text(formData, "institution_id");
  const title = text(formData, "title");
  const priority = text(formData, "priority") as OperationPriority;
  const status = text(formData, "status") as OperationStatus;

  if (!institutionId) return { error: "Kurum seçilmeli." };
  if (!title) return { error: "Görev adı gerekli." };
  if (!PRIORITIES.includes(priority)) return { error: "Geçersiz öncelik." };
  if (!STATUSES.includes(status)) return { error: "Geçersiz durum." };

  const progressRaw = text(formData, "progress");
  let progress = progressRaw ? Number(progressRaw) : 0;
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    return { error: "İlerleme 0 ile 100 arasında olmalı." };
  }

  const blocker = optionalText(formData, "blocker");

  // The database enforces both of these too. Catching them here lets the
  // message explain itself instead of surfacing a constraint name.
  if (status === "blocked" && !blocker) {
    return {
      error: "Engellendi durumu için engelin ne olduğunu yazmanız gerekiyor.",
    };
  }
  if (status === "completed") {
    progress = 100;
  }

  const startDate = optionalText(formData, "start_date");
  const deadline = optionalText(formData, "deadline");
  if (startDate && deadline && deadline < startDate) {
    return { error: "Termin, başlangıç tarihinden önce olamaz." };
  }

  const estimatedCost = parseMoney(text(formData, "estimated_cost"));
  const actualCost = parseMoney(text(formData, "actual_cost"));
  if (text(formData, "estimated_cost") && estimatedCost === null) {
    return { error: "Tahmini maliyet geçerli bir sayı olmalı." };
  }
  if (text(formData, "actual_cost") && actualCost === null) {
    return { error: "Gerçek maliyet geçerli bir sayı olmalı." };
  }

  const supabase = await createSupabaseServerClient();

  const payload = {
    institution_id: institutionId,
    title,
    description: optionalText(formData, "description"),
    category: optionalText(formData, "category"),
    priority,
    status,
    progress,
    responsible_person_id: optionalText(formData, "responsible_person_id"),
    start_date: startDate,
    deadline,
    estimated_cost: estimatedCost,
    actual_cost: actualCost,
    next_action: optionalText(formData, "next_action"),
    next_action_date: optionalText(formData, "next_action_date"),
    waiting_on: optionalText(formData, "waiting_on"),
    blocker,
    ceo_attention: formData.get("ceo_attention") === "on",
    ceo_notes: optionalText(formData, "ceo_notes"),
  };

  const { error } = id
    ? await supabase.from("operations").update(payload).eq("id", id)
    : await supabase
        .from("operations")
        .insert({ ...payload, created_by: viewer!.id });

  if (error) return { error: `Kaydedilemedi: ${error.message}` };

  await recordAudit({
    actorId: viewer!.id,
    actorUsername: viewer!.profile.username,
    action: id ? "update" : "create",
    entityType: "operation",
    entityId: id,
    summary: id ? `Operasyon güncellendi: ${title}` : `Operasyon oluşturuldu: ${title}`,
  });

  revalidatePath("/operations");
  revalidatePath(`/institutions/${institutionId}`);
  return { ok: true };
}

/**
 * Adds a note to an operation's history.
 *
 * Status and progress changes log themselves through a database trigger; this
 * is for the things a person needs to say in their own words.
 */
export async function addOperationNoteAction(
  _previous: OperationState,
  formData: FormData
): Promise<OperationState> {
  const viewer = await getViewer();
  if (!can(viewer, permission(MODULES.operations, "edit"))) {
    return { error: "Not ekleme yetkiniz yok." };
  }

  const operationId = text(formData, "operation_id");
  const body = text(formData, "body");

  if (!operationId) return { error: "Operasyon bulunamadı." };
  if (!body) return { error: "Not boş olamaz." };

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("operation_updates").insert({
    operation_id: operationId,
    author_id: viewer!.id,
    author_name: viewer!.profile.full_name,
    kind: "note",
    body,
  });

  if (error) return { error: `Not eklenemedi: ${error.message}` };

  revalidatePath("/operations");
  return { ok: true };
}

export async function savePersonAction(
  _previous: OperationState,
  formData: FormData
): Promise<OperationState> {
  const viewer = await getViewer();
  if (!can(viewer, permission(MODULES.people, "manage"))) {
    return { error: "Kişi ekleme yetkiniz yok." };
  }

  const id = optionalText(formData, "id");
  const fullName = text(formData, "full_name");
  if (!fullName) return { error: "Ad soyad gerekli." };

  const supabase = await createSupabaseServerClient();

  const payload = {
    full_name: fullName,
    role_title: optionalText(formData, "role_title"),
    phone: optionalText(formData, "phone"),
    email: optionalText(formData, "email"),
    institution_id: optionalText(formData, "institution_id"),
    is_active: formData.get("is_active") !== "off",
  };

  const { error } = id
    ? await supabase.from("people").update(payload).eq("id", id)
    : await supabase.from("people").insert(payload);

  if (error) return { error: `Kaydedilemedi: ${error.message}` };

  await recordAudit({
    actorId: viewer!.id,
    actorUsername: viewer!.profile.username,
    action: id ? "update" : "create",
    entityType: "person",
    entityId: id,
    summary: id ? `Kişi güncellendi: ${fullName}` : `Kişi eklendi: ${fullName}`,
  });

  revalidatePath("/operations");
  revalidatePath("/admin/people");
  return { ok: true };
}
