/**
 * Database types.
 *
 * Hand-maintained to match `supabase/migrations`. Once the Supabase CLI is
 * linked to the project these can be regenerated instead:
 *
 *   npx supabase gen types typescript --linked > types/database.ts
 *
 * Until then, a schema change means editing this file in the same commit as
 * the migration that caused it.
 */

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "upload"
  | "export"
  | "manage";

export type InstitutionScope = "all" | "specific";
export type InstitutionStatus = "active" | "paused" | "closed";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Row plus the Insert/Update shapes derived from which columns have defaults. */
type Table<Row, Defaulted extends keyof Row = never> = {
  Row: Row;
  Insert: Omit<Row, Defaulted> & Partial<Pick<Row, Defaulted>>;
  Update: Partial<Row>;
  Relationships: [];
};

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type CompanyRow = Timestamps & {
  id: string;
  code: string;
  name: string;
  legal_name: string | null;
  is_active: boolean;
  sort_order: number;
  default_salary_payment_day: number | null;
  notes: string | null;
};

export type InstitutionRow = Timestamps & {
  id: string;
  company_id: string;
  code: string;
  name: string;
  short_name: string | null;
  institution_type: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  status: InstitutionStatus;
  opened_on: string | null;
  closed_on: string | null;
  sort_order: number;
  notes: string | null;
  manager_profile_id: string | null;
};

export type EducationPeriodRow = Timestamps & {
  id: string;
  name: string;
  short_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

export type ProfileRow = Timestamps & {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  is_active: boolean;
  institution_scope: InstitutionScope;
  primary_institution_id: string | null;
  last_login_at: string | null;
};

export type RoleRow = Timestamps & {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  rank: number;
};

export type PermissionRow = {
  id: string;
  key: string;
  module: string;
  action: PermissionAction;
  label: string;
  description: string | null;
  sort_order: number;
  created_at: string;
};

export type RolePermissionRow = {
  role_id: string;
  permission_id: string;
  created_at: string;
};

export type UserRoleRow = {
  user_id: string;
  role_id: string;
  created_at: string;
};

export type UserPermissionOverrideRow = {
  user_id: string;
  permission_id: string;
  granted: boolean;
  note: string | null;
  created_at: string;
};

export type UserInstitutionAccessRow = {
  user_id: string;
  institution_id: string;
  created_at: string;
};

export type AuditLogRow = {
  id: number;
  actor_id: string | null;
  actor_username: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  old_value: Json | null;
  new_value: Json | null;
  ip_address: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      companies: Table<
        CompanyRow,
        | "id"
        | "legal_name"
        | "is_active"
        | "sort_order"
        | "default_salary_payment_day"
        | "notes"
        | "created_at"
        | "updated_at"
      >;
      institutions: Table<
        InstitutionRow,
        | "id"
        | "short_name"
        | "institution_type"
        | "city"
        | "district"
        | "address"
        | "status"
        | "opened_on"
        | "closed_on"
        | "sort_order"
        | "notes"
        | "manager_profile_id"
        | "created_at"
        | "updated_at"
      >;
      education_periods: Table<
        EducationPeriodRow,
        "id" | "is_active" | "created_at" | "updated_at"
      >;
      profiles: Table<
        ProfileRow,
        | "email"
        | "phone"
        | "title"
        | "is_active"
        | "institution_scope"
        | "primary_institution_id"
        | "last_login_at"
        | "created_at"
        | "updated_at"
      >;
      roles: Table<
        RoleRow,
        "id" | "description" | "is_system" | "rank" | "created_at" | "updated_at"
      >;
      permissions: Table<
        PermissionRow,
        "id" | "description" | "sort_order" | "created_at"
      >;
      role_permissions: Table<RolePermissionRow, "created_at">;
      user_roles: Table<UserRoleRow, "created_at">;
      user_permission_overrides: Table<
        UserPermissionOverrideRow,
        "note" | "created_at"
      >;
      user_institution_access: Table<UserInstitutionAccessRow, "created_at">;
      audit_logs: Table<
        AuditLogRow,
        | "id"
        | "actor_id"
        | "actor_username"
        | "entity_id"
        | "old_value"
        | "new_value"
        | "ip_address"
        | "created_at"
      >;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      permission_action: PermissionAction;
      institution_scope: InstitutionScope;
      institution_status: InstitutionStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
