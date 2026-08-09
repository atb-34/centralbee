import { redirect } from "next/navigation";

import { can, requireViewer } from "@/lib/auth/viewer";
import { MODULES, permission } from "@/lib/permissions/keys";

/**
 * `/admin` has no screen of its own — it forwards to the first admin area the
 * viewer is allowed to open.
 */
export default async function AdminIndexPage() {
  const viewer = await requireViewer();

  const destinations: [string, string][] = [
    [permission(MODULES.adminUsers, "view"), "/admin/users"],
    [permission(MODULES.adminRoles, "view"), "/admin/roles"],
    [permission(MODULES.adminCompanies, "view"), "/admin/companies"],
    [permission(MODULES.adminEducationPeriods, "view"), "/admin/education-periods"],
    [permission(MODULES.adminAuditLog, "view"), "/admin/audit-log"],
  ];

  for (const [key, href] of destinations) {
    if (can(viewer, key)) redirect(href);
  }

  redirect("/daily");
}
