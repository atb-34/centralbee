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

export type ObligationType =
  | "salary"
  | "rent"
  | "sgk"
  | "tax"
  | "insurance"
  | "other";

export type OperationPriority = "critical" | "high" | "medium" | "low";

export type OperationStatus =
  | "not_started"
  | "in_progress"
  | "waiting"
  | "blocked"
  | "completed"
  | "cancelled";

export type OperationUpdateKind =
  | "created"
  | "note"
  | "status"
  | "priority"
  | "progress"
  | "deadline"
  | "attention";

export type IncreaseRule =
  | "none"
  | "fixed_percent"
  | "inflation"
  | "contract"
  | "custom";

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

/**
 * One version of one recurring obligation.
 *
 * Rows are never updated in place when an amount changes — a new row is added
 * and the previous one gets its `effective_to` closed. `effective_to === null`
 * means "still in force".
 */
export type RecurringObligationRow = Timestamps & {
  id: string;
  institution_id: string;
  obligation_type: ObligationType;
  /** Distinguishes a second obligation of the same type (two rent contracts). */
  stream_name: string;
  counterparty: string | null;
  /**
   * numeric(14,2). Arrives as a JSON number; the range caps at ~1e12, well
   * inside the integer-exact range of a double once counted in kuruş, so no
   * precision is lost on the way through.
   */
  amount_total: number;
  amount_bank: number | null;
  amount_cash: number | null;
  payment_day: number | null;
  effective_from: string;
  effective_to: string | null;
  increase_rule: IncreaseRule;
  increase_rate: number | null;
  /** Annual increase anniversary — recurs every year, so no year is stored. */
  increase_month: number | null;
  increase_day: number | null;
  notes: string | null;
};

export type PersonRow = Timestamps & {
  id: string;
  full_name: string;
  role_title: string | null;
  phone: string | null;
  email: string | null;
  company_id: string | null;
  institution_id: string | null;
  /** Set when this person also has a login. */
  profile_id: string | null;
  is_active: boolean;
  notes: string | null;
};

export type OperationRow = Timestamps & {
  id: string;
  institution_id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: OperationPriority;
  status: OperationStatus;
  progress: number;
  responsible_person_id: string | null;
  start_date: string | null;
  deadline: string | null;
  completed_at: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  next_action: string | null;
  next_action_date: string | null;
  waiting_on: string | null;
  blocker: string | null;
  ceo_attention: boolean;
  ceo_notes: string | null;
  created_by: string | null;
};

export type OperationUpdateRow = {
  id: number;
  operation_id: string;
  author_id: string | null;
  author_name: string | null;
  kind: OperationUpdateKind;
  body: string;
  old_value: Json | null;
  new_value: Json | null;
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
      recurring_obligations: Table<
        RecurringObligationRow,
        | "id"
        | "stream_name"
        | "counterparty"
        | "amount_bank"
        | "amount_cash"
        | "payment_day"
        | "effective_to"
        | "increase_rule"
        | "increase_rate"
        | "increase_month"
        | "increase_day"
        | "notes"
        | "created_at"
        | "updated_at"
      >;
      people: Table<
        PersonRow,
        | "id"
        | "role_title"
        | "phone"
        | "email"
        | "company_id"
        | "institution_id"
        | "profile_id"
        | "is_active"
        | "notes"
        | "created_at"
        | "updated_at"
      >;
      operations: Table<
        OperationRow,
        | "id"
        | "description"
        | "category"
        | "priority"
        | "status"
        | "progress"
        | "responsible_person_id"
        | "start_date"
        | "deadline"
        | "completed_at"
        | "estimated_cost"
        | "actual_cost"
        | "next_action"
        | "next_action_date"
        | "waiting_on"
        | "blocker"
        | "ceo_attention"
        | "ceo_notes"
        | "created_by"
        | "created_at"
        | "updated_at"
      >;
      operation_updates: Table<
        OperationUpdateRow,
        "id" | "author_id" | "author_name" | "old_value" | "new_value" | "created_at"
      >;
    };
    Views: Record<never, never>;
    Functions: {
      /**
       * Closes the current version and opens a new one, atomically.
       * Returns the new version's id.
       */
      set_recurring_obligation: {
        Args: {
          p_institution_id: string;
          p_obligation_type: ObligationType;
          p_stream_name: string;
          p_effective_from: string;
          p_amount_total: number;
          p_amount_bank?: number | null;
          p_amount_cash?: number | null;
          p_payment_day?: number | null;
          p_counterparty?: string | null;
          p_increase_rule?: IncreaseRule;
          p_increase_rate?: number | null;
          p_increase_month?: number | null;
          p_increase_day?: number | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
    };
    Enums: {
      permission_action: PermissionAction;
      institution_scope: InstitutionScope;
      institution_status: InstitutionStatus;
      obligation_type: ObligationType;
      increase_rule: IncreaseRule;
      operation_priority: OperationPriority;
      operation_status: OperationStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};
