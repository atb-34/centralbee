"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { saveRolePermissionsAction, type RolePermissionState } from "./actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ACTION_LABELS, ACTION_ORDER } from "@/lib/permissions/keys";
import type { PermissionAction } from "@/types/database";

export type PermissionCell = {
  id: string;
  action: PermissionAction;
};

export type ModuleRow = {
  module: string;
  label: string;
  cells: PermissionCell[];
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? (
        <>
          <LoaderCircle className="animate-spin" />
          Kaydediliyor
        </>
      ) : (
        "Değişiklikleri kaydet"
      )}
    </Button>
  );
}

/**
 * Modules down, actions across. The grid makes the shape of a role legible at
 * a glance — which is the point of separating module from action in the first
 * place. A blank cell means the pair does not exist for that module.
 */
export function PermissionMatrix({
  roleId,
  roleName,
  readOnly,
  modules,
  grantedIds,
}: {
  roleId: string;
  roleName: string;
  readOnly: boolean;
  modules: ModuleRow[];
  grantedIds: string[];
}) {
  const [state, formAction] = useActionState<RolePermissionState, FormData>(
    saveRolePermissionsAction,
    {}
  );
  const granted = new Set(grantedIds);

  React.useEffect(() => {
    if (state.ok) toast.success(`${roleName} yetkileri güncellendi.`);
  }, [state, roleName]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="role_id" value={roleId} />

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border">
              <th className="label-caps sticky left-0 z-10 bg-card px-3 py-2 text-left text-muted-foreground">
                Modül
              </th>
              {ACTION_ORDER.map((action) => (
                <th
                  key={action}
                  className="label-caps px-3 py-2 text-center text-muted-foreground"
                >
                  {ACTION_LABELS[action]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((row) => (
              <tr key={row.module} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 bg-card px-3 py-2">
                  <div className="flex flex-col">
                    <span className="font-medium">{row.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.module}
                    </span>
                  </div>
                </td>

                {ACTION_ORDER.map((action) => {
                  const cell = row.cells.find((item) => item.action === action);
                  return (
                    <td key={action} className="px-3 py-2 text-center">
                      {cell ? (
                        <Checkbox
                          name="permission_ids"
                          value={cell.id}
                          defaultChecked={granted.has(cell.id)}
                          disabled={readOnly}
                          aria-label={`${row.label} — ${ACTION_LABELS[action]}`}
                        />
                      ) : (
                        <span aria-hidden className="text-border">
                          ·
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-critical/35 bg-critical-subtle px-3 py-2 text-[13px] text-critical"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {state.error}
        </p>
      ) : null}

      {!readOnly ? (
        <div className="flex justify-end">
          <SaveButton />
        </div>
      ) : null}
    </form>
  );
}
