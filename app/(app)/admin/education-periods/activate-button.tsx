"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import * as React from "react";

import { activatePeriodAction, type PeriodState } from "./actions";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="xs" variant="outline" disabled={pending}>
      {pending ? <LoaderCircle className="animate-spin" /> : null}
      Aktif yap
    </Button>
  );
}

export function ActivateButton({ periodId }: { periodId: string }) {
  const [state, formAction] = useActionState<PeriodState, FormData>(
    activatePeriodAction,
    {}
  );

  React.useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={periodId} />
      <Submit />
    </form>
  );
}
