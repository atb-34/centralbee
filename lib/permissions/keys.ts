import type { PermissionAction } from "@/types/database";

/**
 * Permission modules. These strings must match the catalogue seeded in
 * `supabase/migrations/0006_permission_catalogue.sql`.
 */
export const MODULES = {
  daily: "daily",
  institutions: "institutions",
  /** Money data on an institution: salary, rent, SGK. Deliberately separate. */
  institutionObligations: "institutions.obligations",
  operations: "operations",
  /** Staff and counterparty directory: who is responsible for what. */
  people: "people",
  reportsPerformance: "reports.performance",
  reportsRanking: "reports.performance.ranking",
  reportsFinancial: "reports.financial",
  budget: "budget",
  ads: "ads",
  uploadSales: "data_upload.sales",
  uploadFinancial: "data_upload.financial",
  uploadBank: "data_upload.bank",
  uploadCashFlow: "data_upload.cash_flow",
  uploadExpenses: "data_upload.expenses",
  uploadPos: "data_upload.pos",
  uploadChecks: "data_upload.checks",
  uploadCrm: "data_upload.crm",
  uploadAds: "data_upload.ads",
  uploadInstitutions: "data_upload.institutions",
  targets: "data_upload.targets",
  adminUsers: "admin.users",
  adminRoles: "admin.roles",
  adminPermissions: "admin.permissions",
  adminCompanies: "admin.companies",
  adminInstitutions: "admin.institutions",
  adminEducationPeriods: "admin.education_periods",
  adminCategories: "admin.categories",
  adminAuditLog: "admin.audit_log",
  adminSystemSettings: "admin.system_settings",
} as const;

export type ModuleKey = (typeof MODULES)[keyof typeof MODULES];

/** `permission("reports.financial", "view")` → `"reports.financial:view"` */
export function permission(module: ModuleKey, action: PermissionAction): string {
  return `${module}:${action}`;
}

/** Human labels for actions, used by the admin permission grid. */
export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: "Görüntüle",
  create: "Oluştur",
  edit: "Düzenle",
  delete: "Sil",
  upload: "Yükle",
  export: "Dışa Aktar",
  manage: "Yönet",
};

export const ACTION_ORDER: PermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
  "upload",
  "export",
  "manage",
];
