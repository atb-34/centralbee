"use client";

import * as React from "react";

import { saveOperationAction } from "./actions";
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
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/calc/operations";
import type {
  OperationPriority,
  OperationRow,
  OperationStatus,
} from "@/types/database";

export type InstitutionOption = { id: string; name: string };
export type PersonOption = { id: string; name: string };

export function OperationDialog({
  trigger,
  institutions,
  people,
  operation,
  defaultInstitutionId,
}: {
  trigger: React.ReactNode;
  institutions: InstitutionOption[];
  people: PersonOption[];
  operation?: OperationRow;
  defaultInstitutionId?: string;
}) {
  const editing = Boolean(operation);

  const [institutionId, setInstitutionId] = React.useState(
    operation?.institution_id ?? defaultInstitutionId ?? institutions[0]?.id ?? ""
  );
  const [priority, setPriority] = React.useState<OperationPriority>(
    operation?.priority ?? "medium"
  );
  const [status, setStatus] = React.useState<OperationStatus>(
    operation?.status ?? "not_started"
  );
  const [personId, setPersonId] = React.useState(
    operation?.responsible_person_id ?? ""
  );

  return (
    <FormDialog
      trigger={trigger}
      title={editing ? "Operasyonu düzenle" : "Yeni operasyon"}
      description="Kuruma bağlı bir iş: tadilat, bakım, izin süreci, satın alma."
      action={saveOperationAction}
      submitLabel={editing ? "Kaydet" : "Oluştur"}
    >
      {operation ? <input type="hidden" name="id" value={operation.id} /> : null}
      <input type="hidden" name="institution_id" value={institutionId} />
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="responsible_person_id" value={personId} />

      <Field label="Görev" wide>
        <Input name="title" defaultValue={operation?.title ?? ""} required />
      </Field>

      <Field label="Açıklama" wide>
        <Input name="description" defaultValue={operation?.description ?? ""} />
      </Field>

      <Field label="Kurum">
        <Select value={institutionId} onValueChange={setInstitutionId}>
          <SelectTrigger>
            <SelectValue placeholder="Seçin" />
          </SelectTrigger>
          <SelectContent>
            {institutions.map((institution) => (
              <SelectItem key={institution.id} value={institution.id}>
                {institution.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Kategori" hint="Örn. Tadilat, Bakım, Satın alma">
        <Input name="category" defaultValue={operation?.category ?? ""} />
      </Field>

      <Field label="Öncelik">
        <Select
          value={priority}
          onValueChange={(value) => setPriority(value as OperationPriority)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PRIORITY_LABELS) as OperationPriority[]).map((key) => (
              <SelectItem key={key} value={key}>
                {PRIORITY_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Durum">
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as OperationStatus)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABELS) as OperationStatus[]).map((key) => (
              <SelectItem key={key} value={key}>
                {STATUS_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Sorumlu">
        <Select
          value={personId || "none"}
          onValueChange={(value) => setPersonId(value === "none" ? "" : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seçin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Atanmadı</SelectItem>
            {people.map((person) => (
              <SelectItem key={person.id} value={person.id}>
                {person.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="İlerleme (%)"
        hint={status === "completed" ? "Tamamlandı seçilince %100 olur." : undefined}
      >
        <Input
          name="progress"
          type="number"
          min={0}
          max={100}
          defaultValue={operation?.progress ?? 0}
        />
      </Field>

      <Field label="Başlangıç">
        <Input
          name="start_date"
          type="date"
          defaultValue={operation?.start_date ?? ""}
        />
      </Field>

      <Field label="Termin">
        <Input name="deadline" type="date" defaultValue={operation?.deadline ?? ""} />
      </Field>

      <Field label="Tahmini maliyet (₺)">
        <Input
          name="estimated_cost"
          inputMode="decimal"
          defaultValue={operation?.estimated_cost ?? ""}
          className="tabular"
        />
      </Field>

      <Field label="Gerçek maliyet (₺)">
        <Input
          name="actual_cost"
          inputMode="decimal"
          defaultValue={operation?.actual_cost ?? ""}
          className="tabular"
        />
      </Field>

      <Field label="Sonraki adım" wide>
        <Input name="next_action" defaultValue={operation?.next_action ?? ""} />
      </Field>

      <Field label="Sonraki adım tarihi">
        <Input
          name="next_action_date"
          type="date"
          defaultValue={operation?.next_action_date ?? ""}
        />
      </Field>

      <Field label="Kimi bekliyor">
        <Input name="waiting_on" defaultValue={operation?.waiting_on ?? ""} />
      </Field>

      {status === "blocked" ? (
        <Field
          label="Engel nedir?"
          wide
          hint="Engellendi durumu için zorunlu — nedeni yazılmayan engel takip edilemez."
        >
          <Input name="blocker" defaultValue={operation?.blocker ?? ""} required />
        </Field>
      ) : (
        <input type="hidden" name="blocker" value={operation?.blocker ?? ""} />
      )}

      <Field label="CEO dikkati" wide>
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox
            name="ceo_attention"
            defaultChecked={operation?.ceo_attention ?? false}
          />
          CEO kararı veya ilgisi gerekiyor — listede en üste çıkar
        </label>
      </Field>

      <Field label="CEO notu" wide>
        <Input name="ceo_notes" defaultValue={operation?.ceo_notes ?? ""} />
      </Field>
    </FormDialog>
  );
}
