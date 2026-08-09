import * as React from "react";

import { can, canAny, getViewer } from "@/lib/auth/viewer";

/**
 * Hides UI the viewer has no permission for.
 *
 * A convenience only. It keeps buttons out of the way that would fail anyway;
 * it is not what stops the action. RLS does that.
 */
export async function PermissionGate({
  permission,
  anyOf,
  fallback = null,
  children,
}: {
  permission?: string;
  anyOf?: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const viewer = await getViewer();

  const allowed = permission
    ? can(viewer, permission)
    : anyOf
      ? canAny(viewer, anyOf)
      : false;

  return allowed ? <>{children}</> : <>{fallback}</>;
}
