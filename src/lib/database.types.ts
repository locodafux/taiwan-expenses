// Hand-written to match supabase/migrations/*.sql (no local Docker stack
// available in this sandbox to run `supabase gen types typescript`).
// Regenerate with that command once a real/local project is reachable:
//   supabase gen types typescript --local > src/lib/database.types.ts

export type CategoryKind = 'bill' | 'fund';
// 'skipped' is written only by materialize_payday, mirroring a
// category_month_skips row onto that month's entries (20260920000003).
export type LedgerStatus = 'pending' | 'checked' | 'skipped';

export type CategoryRule =
  // one_time: a lump sum (e.g. a trip) taken from the earliest month that can
  // cover it, instead of spread evenly (20260921000050_goal_waterfill.sql).
  | { type: 'goal'; target_amount: number; target_date?: string | null; one_time?: boolean }
  | { type: 'capped_percent'; percent: number; cap?: number | null }
  | { type: 'remainder'; percent: number };

// These must be `type` aliases, not `interface` declarations -
// @supabase/postgrest-js's select-query-parser resolves embedded/`*` select
// projections to `never` when a table's Row/Insert/Update is an interface
// reference rather than a plain object type (verified against the installed
// postgrest-js: identical shape, only interface-vs-type differed).

export type Household = {
  id: string;
  name: string;
  created_at: string;
};

export type HouseholdMember = {
  id: string;
  household_id: string;
  user_id: string;
  display_name: string;
  color: string | null;
  notifications_enabled: boolean;
  created_at: string;
};

export type HouseholdInvite = {
  id: string;
  household_id: string;
  code: string;
  created_by: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
  expires_at: string;
  created_at: string;
};

export type Category = {
  id: string;
  household_id: string;
  kind: CategoryKind;
  name: string;
  color: string | null;
  sort_order: number;
  rule: CategoryRule | null;
  archived: boolean;
  goal_celebrated_at: string | null;
  created_at: string;
};

export type Income = {
  id: string;
  household_id: string;
  member_id: string;
  label: string;
  amount: number;
  recurring_day: number;
  active: boolean;
  created_at: string;
};

export type BillItem = {
  id: string;
  household_id: string;
  category_id: string;
  label: string;
  amount: number;
  recurring_day: number;
  end_date: string | null;
  created_at: string;
};

export type LedgerEntry = {
  id: string;
  household_id: string;
  category_id: string;
  bill_item_id: string | null;
  payday_date: string;
  amount: number;
  status: LedgerStatus;
  // an extra deposit on top of the plan; materialize_payday never touches it
  manual: boolean;
  checked_by: string | null;
  checked_at: string | null;
  created_at: string;
};

export type CategoryMonthSkip = {
  id: string;
  household_id: string;
  category_id: string;
  month: string;
  created_by: string | null;
  created_at: string;
};

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

export type BugReport = {
  id: string;
  user_id: string | null;
  household_id: string | null;
  description: string;
  app_version: string | null;
  platform: string | null;
  os_version: string | null;
  created_at: string;
};

type TableDef<Row, Insert, Relationships extends Relationship[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: Relationships;
};

export type PushToken = {
  token: string;
  user_id: string;
  created_at: string;
};

export type Message = {
  id: string;
  household_id: string;
  // null only once that member deletes their account (on delete set null) -
  // the thread survives for whoever stays, so the UI falls back to "Someone".
  sender_id: string | null;
  body: string;
  created_at: string;
};

export interface Database {
  public: {
    Tables: {
      households: TableDef<Household, Partial<Household> & { name: string }>;
      household_members: TableDef<
        HouseholdMember,
        Partial<HouseholdMember> & { household_id: string; user_id: string; display_name: string },
        [
          {
            foreignKeyName: 'household_members_household_id_fkey';
            columns: ['household_id'];
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ]
      >;
      household_invites: TableDef<
        HouseholdInvite,
        Partial<HouseholdInvite> & { household_id: string; code: string; created_by: string; expires_at: string },
        [
          {
            foreignKeyName: 'household_invites_household_id_fkey';
            columns: ['household_id'];
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ]
      >;
      categories: TableDef<
        Category,
        Partial<Category> & { household_id: string; kind: CategoryKind; name: string },
        [
          {
            foreignKeyName: 'categories_household_id_fkey';
            columns: ['household_id'];
            referencedRelation: 'households';
            referencedColumns: ['id'];
          },
        ]
      >;
      incomes: TableDef<
        Income,
        Partial<Income> & { member_id: string; label: string; amount: number; recurring_day: number },
        [
          {
            foreignKeyName: 'incomes_member_id_fkey';
            columns: ['member_id'];
            referencedRelation: 'household_members';
            referencedColumns: ['id'];
          },
        ]
      >;
      bill_items: TableDef<
        BillItem,
        Partial<BillItem> & { category_id: string; label: string; amount: number; recurring_day: number },
        [
          {
            foreignKeyName: 'bill_items_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ]
      >;
      ledger_entries: TableDef<
        LedgerEntry,
        Partial<LedgerEntry> & {
          household_id: string;
          category_id: string;
          payday_date: string;
          amount: number;
        },
        [
          {
            foreignKeyName: 'ledger_entries_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ledger_entries_bill_item_id_fkey';
            columns: ['bill_item_id'];
            referencedRelation: 'bill_items';
            referencedColumns: ['id'];
          },
        ]
      >;
      category_month_skips: TableDef<
        CategoryMonthSkip,
        Partial<CategoryMonthSkip> & { household_id: string; category_id: string; month: string },
        [
          {
            foreignKeyName: 'category_month_skips_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ]
      >;
      bug_reports: TableDef<BugReport, Partial<BugReport> & { description: string }>;
      messages: TableDef<Message, Partial<Message> & { household_id: string; body: string }>;
      push_tokens: TableDef<PushToken, Partial<PushToken> & { token: string; user_id: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      materialize_payday: {
        Args: { p_household_id: string; p_payday_date?: string | null };
        Returns: LedgerEntry[];
      };
      goal_shortfalls: {
        Args: { p_household_id: string; p_date?: string };
        Returns: { category_id: string; shortfall: number }[];
      };
      payday_carries: {
        Args: { p_household_id: string; p_date: string };
        Returns: { from_payday: string | null; to_payday: string; amount: number }[];
      };
      create_household_invite: {
        Args: { p_ttl?: string };
        Returns: HouseholdInvite;
      };
      delete_own_account: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      update_own_display_name: {
        Args: { p_display_name: string };
        Returns: undefined;
      };
      clear_chat_history: {
        Args: { p_household_id: string };
        Returns: undefined;
      };
      register_push_token: {
        Args: { p_token: string };
        Returns: undefined;
      };
      set_notifications_enabled: {
        Args: { p_enabled: boolean };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
