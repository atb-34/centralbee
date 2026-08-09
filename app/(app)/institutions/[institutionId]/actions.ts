"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { can, getViewer } from "@/lib/auth/viewer";
import { OBLIGATION_LABELS } from "@/lib/calc/obligations";
import { MODULES, permission } from "@/lib/permissions/keys";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { IncreaseRule, ObligationType } from "@/types/database";

export type ObligationState = { error?: string; ok?: boolean };

const OBLIGATION_TYPES: ObligationType[] = [
  "salary",
  "rent",
  "sgk",
  "tax",
  "insurance",
  "other",
];

const INCREASE_RULES: IncreaseRule[] = [
  "none",
  "fixed_percent",
  "inflation",
  "contract",
  "custom",
];

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

/**
 * Turkish number entry: "1.250.000,50" and "1250000.50" both mean the same
 * amount. Accepting only one of them would make this form quietly hostile.
 */
function parseAmount(raw: string): number | null {
  if (!raw) return null;

  const cleaned = raw.replace(/\s/g, "");
  const hasComma = cleaned.includes(",");
  const normalised = hasComma
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/\.(?=\d{3}\b)/g, "");

  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

export async function saveObligationAction(
  _previous: ObligationState,
  formData: FormData
): Promise<ObligationState> {
  const viewer = await getViewer();

  if (
    !can(viewer, permission(MODULES.institutionObligations, "create")) &&
    !can(viewer, permission(MODULES.institutionObligations, "edit"))
  ) {
    return { error: "Bu işlem için yetkiniz yok." };
  }

  const institutionId = text(formData, "institution_id");
  const obligationType = text(formData, "obligation_type") as ObligationType;
  const streamName = text(formData, "stream_name");
  const effectiveFrom = text(formData, "effective_from");
  const increaseRule = (text(formData, "increase_rule") || "none") as IncreaseRule;

  if (!institutionId) return { error: "Kurum bulunamadı." };
  if (!OBLIGATION_TYPES.includes(obligationType)) {
    return { error: "Geçersiz yükümlülük türü." };
  }
  if (!INCREASE_RULES.includes(increaseRule)) {
    return { error: "Geçersiz artış kuralı." };
  }
  if (!effectiveFrom) return { error: "Geçerlilik başlangıç tarihi gerekli." };

  const amountTotal = parseAmount(text(formData, "amount_total"));
  if (amountTotal === null || amountTotal < 0) {
    return { error: "Tutar geçerli bir sayı olmalı." };
  }

  let amountBank: number | null = null;
  let amountCash: number | null = null;

  if (obligationType === "salary") {
    amountBank = parseAmount(text(formData, "amount_bank"));
    amountCash = parseAmount(text(formData, "amount_cash"));

    const anyProvided = amountBank !== null || amountCash !== null;
    if (anyProvided) {
      amountBank = amountBank ?? 0;
      amountCash = amountCash ?? 0;

      // Caught by a database constraint too, but the message here can explain
      // itself in the user's own numbers.
      const split = amountBank + amountCash;
      if (Math.abs(split - amountTotal) > 0.005) {
        return {
          error: `Banka (${amountBank}) ve nakit (${amountCash}) toplamı ${split}, toplam maaş ${amountTotal}. İkisi eşit olmalı.`,
        };
      }
    }
  }

  const paymentDayRaw = text(formData, "payment_day");
  let paymentDay: number | null = null;
  if (paymentDayRaw) {
    const parsed = Number(paymentDayRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) {
      return { error: "Ödeme günü 1 ile 31 arasında olmalı." };
    }
    paymentDay = parsed;
  }

  let increaseRate: number | null = null;
  if (increaseRule === "fixed_percent") {
    increaseRate = parseAmount(text(formData, "increase_rate"));
    if (increaseRate === null) {
      return { error: "Sabit yüzde seçildiğinde artış oranı girilmeli." };
    }
  }

  const supabase = await createSupabaseServerClient();

  // A single RPC: closing the old version and opening the new one must either
  // both happen or neither.
  const { error } = await supabase.rpc("set_recurring_obligation", {
    p_institution_id: institutionId,
    p_obligation_type: obligationType,
    p_stream_name: streamName,
    p_effective_from: effectiveFrom,
    p_amount_total: amountTotal,
    p_amount_bank: amountBank,
    p_amount_cash: amountCash,
    p_payment_day: paymentDay,
    p_counterparty: optionalText(formData, "counterparty"),
    p_increase_rule: increaseRule,
    p_increase_rate: increaseRate,
    p_notes: optionalText(formData, "notes"),
  });

  if (error) {
    // The function raises with messages written for the person reading them.
    return { error: error.message || "Kaydedilemedi." };
  }

  const label = OBLIGATION_LABELS[obligationType];
  await recordAudit({
    actorId: viewer!.id,
    actorUsername: viewer!.profile.username,
    action: "update",
    entityType: "recurring_obligation",
    entityId: institutionId,
    summary: `${label}${streamName ? ` · ${streamName}` : ""} için ${effectiveFrom} tarihinden geçerli yeni sürüm oluşturuldu (${amountTotal})`,
    newValue: {
      obligation_type: obligationType,
      stream_name: streamName,
      effective_from: effectiveFrom,
      amount_total: amountTotal,
    },
  });

  revalidatePath(`/institutions/${institutionId}`);
  return { ok: true };
}
