"use client";

import * as React from "react";

import { saveObligationAction } from "./actions";
import { Field, FormDialog } from "@/components/app/form-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OBLIGATION_LABELS, OBLIGATION_ORDER } from "@/lib/calc/obligations";
import { todayInAppZone } from "@/lib/format/date";
import type {
  IncreaseRule,
  ObligationType,
  RecurringObligationRow,
} from "@/types/database";

/**
 * Adds an obligation, or supersedes an existing one with a new version.
 *
 * When superseding, the type and stream are fixed: changing them would not
 * update that obligation, it would silently create a different one and leave
 * the original running.
 */
export function ObligationDialog({
  trigger,
  institutionId,
  companyDefaultDay,
  existing,
}: {
  trigger: React.ReactNode;
  institutionId: string;
  companyDefaultDay: number | null;
  existing?: {
    type: ObligationType;
    streamName: string;
    current: RecurringObligationRow | null;
  };
}) {
  const superseding = Boolean(existing);

  const [type, setType] = React.useState<ObligationType>(
    existing?.type ?? "rent"
  );
  const [increaseRule, setIncreaseRule] = React.useState<IncreaseRule>(
    existing?.current?.increase_rule ?? "none"
  );

  return (
    <FormDialog
      trigger={trigger}
      title={superseding ? "Yeni sürüm ekle" : "Yükümlülük ekle"}
      description={
        superseding
          ? "Mevcut sürüm, yeni sürümün başladığı günden bir gün önce kapatılır. Eski değer silinmez — geçmiş raporlar doğru kalır."
          : "Maaş, kira, SGK gibi her ay tekrarlayan ödemeler."
      }
      action={saveObligationAction}
      submitLabel={superseding ? "Yeni sürümü kaydet" : "Ekle"}
    >
      <input type="hidden" name="institution_id" value={institutionId} />
      <input type="hidden" name="obligation_type" value={type} />
      <input type="hidden" name="increase_rule" value={increaseRule} />
      {superseding ? (
        <input type="hidden" name="stream_name" value={existing?.streamName ?? ""} />
      ) : null}

      {superseding ? null : (
        <Field label="Tür">
          <Select
            value={type}
            onValueChange={(value) => setType(value as ObligationType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBLIGATION_ORDER.map((key) => (
                <SelectItem key={key} value={key}>
                  {OBLIGATION_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {superseding ? null : (
        <Field label="Ayrım adı" hint="Aynı türden ikinci kayıt varsa: “Ana Bina”, “Şube”.">
          <Input name="stream_name" placeholder="Boş bırakılabilir" />
        </Field>
      )}

      <Field
        label="Geçerlilik başlangıcı"
        hint={superseding ? "Bu tarihten itibaren yeni tutar geçerli olur." : undefined}
      >
        <Input
          name="effective_from"
          type="date"
          required
          defaultValue={todayInAppZone()}
        />
      </Field>

      <Field label="Tutar (₺)" hint="Aylık toplam.">
        <Input
          name="amount_total"
          inputMode="decimal"
          required
          defaultValue={existing?.current?.amount_total ?? ""}
          className="tabular"
        />
      </Field>

      {type === "salary" ? (
        <>
          <Field label="Bankadan ödenen (₺)" hint="Banka + nakit = toplam olmalı.">
            <Input
              name="amount_bank"
              inputMode="decimal"
              defaultValue={existing?.current?.amount_bank ?? ""}
              className="tabular"
            />
          </Field>
          <Field label="Nakit ödenen (₺)">
            <Input
              name="amount_cash"
              inputMode="decimal"
              defaultValue={existing?.current?.amount_cash ?? ""}
              className="tabular"
            />
          </Field>
        </>
      ) : null}

      <Field
        label="Ödeme günü"
        hint={
          companyDefaultDay
            ? `Boş bırakılırsa şirket varsayılanı kullanılır: ayın ${companyDefaultDay}'i.`
            : "Ayın kaçında ödendiği."
        }
      >
        <Input
          name="payment_day"
          type="number"
          min={1}
          max={31}
          defaultValue={existing?.current?.payment_day ?? ""}
        />
      </Field>

      <Field label="Karşı taraf" hint="Ev sahibi, kurum, tedarikçi.">
        <Input
          name="counterparty"
          defaultValue={existing?.current?.counterparty ?? ""}
        />
      </Field>

      <Field label="Artış kuralı">
        <Select
          value={increaseRule}
          onValueChange={(value) => setIncreaseRule(value as IncreaseRule)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Artış yok</SelectItem>
            <SelectItem value="fixed_percent">Sabit yüzde</SelectItem>
            <SelectItem value="inflation">Enflasyona endeksli</SelectItem>
            <SelectItem value="contract">Sözleşmeye göre</SelectItem>
            <SelectItem value="custom">Özel</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {increaseRule === "fixed_percent" ? (
        <Field label="Artış oranı (%)">
          <Input
            name="increase_rate"
            inputMode="decimal"
            required
            defaultValue={existing?.current?.increase_rate ?? ""}
            className="tabular"
          />
        </Field>
      ) : null}

      <Field label="Not" wide>
        <Input name="notes" defaultValue={existing?.current?.notes ?? ""} />
      </Field>
    </FormDialog>
  );
}
