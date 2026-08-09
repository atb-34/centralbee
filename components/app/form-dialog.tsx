"use client";

import * as React from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type DialogFormState = { error?: string; ok?: boolean };

/**
 * A dialog wrapping one server action.
 *
 * The action is awaited directly inside a transition rather than through
 * `useActionState`, because the dialog needs the result itself: it closes on
 * success and stays open on failure, keeping the user's typing in front of
 * them instead of discarding the form.
 */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Kaydet",
  children,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: (state: DialogFormState, formData: FormData) => Promise<DialogFormState>;
  submitLabel?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [pending, startTransition] = React.useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await action({}, formData);
      if (result.ok) {
        setError(undefined);
        setOpen(false);
      } else {
        setError(result.error ?? "Beklenmeyen bir hata oluştu.");
      }
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setError(undefined);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">{children}</div>

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-critical/35 bg-critical-subtle px-3 py-2 text-[13px] text-critical"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
            >
              Vazgeç
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Kaydediliyor
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Labelled field for use inside `FormDialog`. */
export function Field({
  label,
  hint,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[13px] font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
