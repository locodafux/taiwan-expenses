import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';
import { monthStart, toDateOnly } from './payday';
import { supabase } from './supabase';
import type { Category, CategoryRule, Income } from './database.types';

// Combines several TanStack Query results into one isError/refetch pair, so
// a screen backed by multiple queries can wire a single retry-on-error state
// instead of checking each hook separately (UX review finding #2).
export function combineQueryState(...queries: { isError: boolean; refetch: () => unknown }[]) {
  return {
    isError: queries.some((q) => q.isError),
    refetch: () => queries.forEach((q) => q.refetch()),
  };
}

// --- Household membership -------------------------------------------------

export function useHouseholdMembership() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['household-member', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_members')
        .select('*')
        .eq('user_id', userId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useHouseholdMembers(householdId: string | undefined) {
  return useQuery({
    queryKey: ['household-members', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', householdId as string)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

export function useHousehold(householdId: string | undefined) {
  return useQuery({
    queryKey: ['household', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('households')
        .select('*')
        .eq('id', householdId as string)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateHouseholdName(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('households')
        .update({ name })
        .eq('id', householdId as string);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['household', householdId] }),
  });
}

// household_members has no client UPDATE policy; the RPC only ever renames
// the caller's own row. Incomes embed display_name, so refresh them too.
export function useUpdateDisplayName(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (displayName: string) => {
      const { error } = await supabase.rpc('update_own_display_name', { p_display_name: displayName });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['household-member'] });
      queryClient.invalidateQueries({ queryKey: ['household-members', householdId] });
      queryClient.invalidateQueries({ queryKey: ['incomes', householdId] });
    },
  });
}

// The master notifications switch: same no-UPDATE-policy reason as above.
export function useSetNotificationsEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.rpc('set_notifications_enabled', { p_enabled: enabled });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['household-member'] }),
  });
}

export function useCreateInvite() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_household_invite', {});
      if (error) throw error;
      return data;
    },
  });
}

// --- Categories -------------------------------------------------------------

export function useCategories(householdId: string | undefined, opts: { includeArchived?: boolean } = {}) {
  return useQuery({
    queryKey: ['categories', householdId, opts.includeArchived],
    enabled: !!householdId,
    queryFn: async () => {
      let query = supabase
        .from('categories')
        .select('*')
        .eq('household_id', householdId as string)
        .order('sort_order');
      if (!opts.includeArchived) query = query.eq('archived', false);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCategory(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      kind: 'bill' | 'fund';
      color: string;
      rule?: CategoryRule;
      sort_order?: number;
    }) => {
      const { data, error } = await supabase
        .from('categories')
        .insert({ household_id: householdId as string, ...input })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', householdId] });
    },
  });
}

export function useUpdateCategory(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Category> & { id: string }) => {
      const { data, error } = await supabase
        .from('categories')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', householdId] });
    },
  });
}

export function useDeleteCategory(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase
        .from('categories')
        .delete({ count: 'exact' })
        .eq('id', id);
      if (error) throw error;
      // A no-op delete (RLS silently denies, or the row was already gone)
      // returns success with zero rows affected — surface that as an error
      // instead of letting the caller believe the category is gone.
      if (count === 0) throw new Error('Category could not be deleted');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', householdId] });
    },
  });
}

// Claims the one-time goal-celebration for a category: the `.is(...)` guard
// means only the first caller to reach this (across devices/household
// members) gets a non-null row back, so the celebration modal shows exactly
// once even if both partners' apps notice the crossed threshold at the same
// time.
export function useMarkGoalCelebrated(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const { data, error } = await supabase
        .from('categories')
        .update({ goal_celebrated_at: new Date().toISOString() })
        .eq('id', categoryId)
        .is('goal_celebrated_at', null)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', householdId] }),
  });
}

// --- Incomes ------------------------------------------------------------------

export function useIncomes(householdId: string | undefined) {
  return useQuery({
    queryKey: ['incomes', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incomes')
        .select('*, household_members(display_name, color)')
        .eq('household_id', householdId as string)
        .order('recurring_day');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateIncome(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      member_id: string;
      label: string;
      amount: number;
      recurring_day: number;
    }) => {
      const { data, error } = await supabase.from('incomes').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incomes', householdId] }),
  });
}

export function useUpdateIncome(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Income> & { id: string }) => {
      const { data, error } = await supabase.from('incomes').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['incomes', householdId] }),
  });
}

// --- Bill items -----------------------------------------------------------

export function useBillItems(categoryId: string | undefined) {
  return useQuery({
    queryKey: ['bill-items', categoryId],
    enabled: !!categoryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bill_items')
        .select('*')
        .eq('category_id', categoryId as string)
        .order('recurring_day');
      if (error) throw error;
      return data;
    },
  });
}

export function useHouseholdBillItems(householdId: string | undefined) {
  return useQuery({
    queryKey: ['bill-items-household', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bill_items')
        .select('*, categories!inner(household_id, kind)')
        .eq('categories.household_id', householdId as string)
        .eq('categories.kind', 'bill');
      if (error) throw error;
      return data;
    },
  });
}

// Goals whose months before the deadline can't cover them (goal_plan's
// shortfall) as of this payday's month - the checklist's shortfall callout.
export function useGoalShortfalls(householdId: string | undefined, paydayDate: string | undefined) {
  return useQuery({
    queryKey: ['goal-shortfalls', householdId, paydayDate],
    enabled: !!householdId && !!paydayDate,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('goal_shortfalls', {
        p_household_id: householdId as string,
        p_date: paydayDate as string,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateBillItem(categoryId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    // `category_id` overrides the hook's categoryId, for callers that only learn it
    // at mutate time (categories/add.tsx creating a bill category + its item).
    mutationFn: async ({
      category_id = categoryId,
      ...input
    }: { label: string; amount: number; recurring_day: number; end_date?: string | null; category_id?: string }) => {
      const { data, error } = await supabase
        .from('bill_items')
        .insert({ category_id: category_id as string, ...input })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bill-items', data.category_id] });
      // The checklist reads the household-wide list (and re-materializes when it changes).
      queryClient.invalidateQueries({ queryKey: ['bill-items-household'] });
    },
  });
}

function invalidateBillItem(queryClient: ReturnType<typeof useQueryClient>, categoryId: string | undefined) {
  queryClient.invalidateQueries({ queryKey: ['bill-items', categoryId] });
  queryClient.invalidateQueries({ queryKey: ['bill-items-household'] });
  queryClient.invalidateQueries({ queryKey: ['ledger-entries'] });
  queryClient.invalidateQueries({ queryKey: ['ledger-payday-status'] });
}

// Drops the item's not-yet-checked checklist rows. materialize_payday only
// upserts, so a row left on a no-longer-valid payday would otherwise linger.
async function deleteUncheckedEntries(billItemId: string) {
  const { error } = await supabase
    .from('ledger_entries')
    .delete()
    .eq('bill_item_id', billItemId)
    .neq('status', 'checked');
  if (error) throw error;
}

export function useUpdateBillItem(categoryId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      dayChanged,
      ...patch
    }: {
      id: string;
      dayChanged: boolean;
      label: string;
      amount: number;
      recurring_day: number;
      end_date: string | null;
    }) => {
      const { error, count } = await supabase
        .from('bill_items')
        .update(patch, { count: 'exact' })
        .eq('id', id);
      if (error) throw error;
      if (count === 0) throw new Error('Item could not be updated');
      // Amount changes are picked up by re-materialization; a moved day leaves
      // the old payday's pending row behind unless it's cleared here.
      if (dayChanged) await deleteUncheckedEntries(id);
    },
    onSuccess: () => invalidateBillItem(queryClient, categoryId),
  });
}

// An item with checked (paid) history is retired via end_date instead of
// deleted, so those ledger rows keep their bill_item_id and label; one with no
// paid history is removed outright. (A hard delete would null the history rows'
// bill_item_id, which also collides with the fund-row unique index.)
export function useDeleteBillItem(categoryId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteUncheckedEntries(id);
      const { count: paid, error: countError } = await supabase
        .from('ledger_entries')
        .select('id', { count: 'exact', head: true })
        .eq('bill_item_id', id);
      if (countError) throw countError;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const { error, count } = paid
        ? await supabase
            .from('bill_items')
            .update({ end_date: toDateOnly(yesterday) }, { count: 'exact' })
            .eq('id', id)
        : await supabase.from('bill_items').delete({ count: 'exact' }).eq('id', id);
      if (error) throw error;
      if (count === 0) throw new Error('Item could not be deleted');
    },
    onSuccess: () => invalidateBillItem(queryClient, categoryId),
  });
}

// --- Ledger / payday checklist ---------------------------------------------

export function useLedgerEntriesForPayday(householdId: string | undefined, paydayDate: string | undefined) {
  return useQuery({
    queryKey: ['ledger-entries', householdId, paydayDate],
    enabled: !!householdId && !!paydayDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('*, categories(name, color, kind), bill_items(label)')
        .eq('household_id', householdId as string)
        .eq('payday_date', paydayDate as string);
      if (error) throw error;
      return data;
    },
  });
}

export function useMaterializePayday(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paydayDate?: string) => {
      const { data, error } = await supabase.rpc('materialize_payday', {
        p_household_id: householdId as string,
        p_payday_date: paydayDate ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, paydayDate) => {
      queryClient.invalidateQueries({ queryKey: ['ledger-entries', householdId, paydayDate] });
      queryClient.invalidateQueries({ queryKey: ['goal-shortfalls', householdId] });
    },
  });
}

export function useCheckLedgerEntry(householdId: string | undefined, paydayDate: string | undefined) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .update(
          checked
            ? { status: 'checked', checked_by: session?.user.id, checked_at: new Date().toISOString() }
            : { status: 'pending', checked_by: null, checked_at: null },
        )
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    // Optimistic: flip the row in the cached checklist immediately so the tick
    // feels instant, roll back if the write fails, and resync with the server
    // either way (Realtime invalidation keeps working on top of this).
    onMutate: async ({ id, checked }) => {
      const key = ['ledger-entries', householdId, paydayDate];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<{ id: string; status: string }[]>(key);
      queryClient.setQueryData<{ id: string; status: string }[]>(key, (rows) =>
        rows?.map((r) => (r.id === id ? { ...r, status: checked ? 'checked' : 'pending' } : r)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['ledger-entries', householdId, paydayDate], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-entries', householdId, paydayDate] });
      queryClient.invalidateQueries({ queryKey: ['category-history'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-payday-status', householdId] });
    },
  });
}

// payday_date/status for every past ledger entry, for the checklist's
// completed-payday streak (completedPaydayStreak in payday.ts) - reads the
// whole household history rather than a precomputed streak column since
// there isn't one yet (fine at this household's scale, see
// useCategoryBalances above).
export function usePaydayCompletionHistory(householdId: string | undefined) {
  return useQuery({
    queryKey: ['ledger-payday-status', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      // Zero-amount rows (nothing to set aside) and skipped rows (always zero)
      // are out of the checklist's count - counting them here would freeze the
      // streak at 0 forever.
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('payday_date, status')
        .neq('amount', 0)
        .eq('household_id', householdId as string);
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateLedgerAmount(householdId: string | undefined, paydayDate: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .update({ amount })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-entries', householdId, paydayDate] });
    },
  });
}

// Skip (or un-skip) one fund category for the month a payday falls in
// (20260920000003_category_month_skips.sql). The table is the source of truth;
// materialize_payday mirrors it onto the month's ledger rows as
// status = 'skipped', amount 0 - so the write is always followed by a
// re-materialization rather than patching ledger_entries here.
export function useToggleMonthSkip(householdId: string | undefined, paydayDate: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, skipped }: { categoryId: string; skipped: boolean }) => {
      const month = monthStart(paydayDate as string);
      if (skipped) {
        const { error } = await supabase
          .from('category_month_skips')
          .insert({ household_id: householdId as string, category_id: categoryId, month });
        if (error) throw error;
      } else {
        const { error, count } = await supabase
          .from('category_month_skips')
          .delete({ count: 'exact' })
          .eq('category_id', categoryId)
          .eq('month', month);
        if (error) throw error;
        // RLS filtering the row out returns success with zero rows affected.
        if (count === 0) throw new Error('Could not un-skip this month');
      }
      const { error: rpcError } = await supabase.rpc('materialize_payday', {
        p_household_id: householdId as string,
        p_payday_date: paydayDate as string,
      });
      if (rpcError) throw rpcError;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-entries', householdId, paydayDate] });
      queryClient.invalidateQueries({ queryKey: ['ledger-payday-status', householdId] });
    },
  });
}

// --- Dashboard balances -------------------------------------------------------

// ponytail: reduced client-side rather than a SQL sum/group-by view - fine at
// this household's scale (docs/techspec.md's sizing note); revisit with a
// Postgres view if the checked-ledger history ever gets large.
export function useCategoryBalances(householdId: string | undefined) {
  return useQuery({
    queryKey: ['category-balances', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('category_id, amount')
        .eq('household_id', householdId as string)
        .eq('status', 'checked');
      if (error) throw error;
      const balances: Record<string, number> = {};
      for (const row of data) {
        balances[row.category_id] = (balances[row.category_id] ?? 0) + row.amount;
      }
      return balances;
    },
  });
}

// Same shape as useCategoryBalances, scoped to the current calendar month -
// what a bill category's dashboard row needs to show "due/paid this month"
// rather than an all-time cumulative total.
export function useCategoryBalancesThisMonth(householdId: string | undefined) {
  return useQuery({
    queryKey: ['category-balances-this-month', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const now = new Date();
      const monthStart = toDateOnly(new Date(now.getFullYear(), now.getMonth(), 1));
      const nextMonthStart = toDateOnly(new Date(now.getFullYear(), now.getMonth() + 1, 1));
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('category_id, amount')
        .eq('household_id', householdId as string)
        .eq('status', 'checked')
        .gte('payday_date', monthStart)
        .lt('payday_date', nextMonthStart);
      if (error) throw error;
      const balances: Record<string, number> = {};
      for (const row of data) {
        balances[row.category_id] = (balances[row.category_id] ?? 0) + row.amount;
      }
      return balances;
    },
  });
}

// Total across all categories (bill + fund) over a trailing 90-day window -
// a rolling window is a single >= filter vs. calendar-quarter boundary math,
// and close enough to the design brief's "this quarter" framing to keep this
// simple and correct. Powers the dashboard's momentum stat (docs/plan.md's
// "financial companion, not a financial mirror" framing).
export function useSavedThisQuarter(householdId: string | undefined) {
  return useQuery({
    queryKey: ['saved-this-quarter', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const since = toDateOnly(new Date(Date.now() - 90 * 86_400_000));
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('amount')
        .eq('household_id', householdId as string)
        .eq('status', 'checked')
        .gte('payday_date', since);
      if (error) throw error;
      return data.reduce((sum, row) => sum + row.amount, 0);
    },
  });
}

// Consecutive fully-checked paydays, most recent first - counts backwards
// from the latest payday that's actually due (skipping ones still in the
// future) and stops at the first payday with any unchecked/pending entry.
// ponytail: minimal version for the dashboard momentum chip; if the
// checklist-celebration task's own streak calc lands separately, unify with
// that rather than keeping two implementations.
export function usePaydayStreak(householdId: string | undefined) {
  return useQuery({
    queryKey: ['payday-streak', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('payday_date, status')
        .eq('household_id', householdId as string)
        .order('payday_date', { ascending: false });
      if (error) throw error;
      const allCheckedByPayday = new Map<string, boolean>();
      for (const row of data) {
        const soFar = allCheckedByPayday.get(row.payday_date) ?? true;
        allCheckedByPayday.set(row.payday_date, soFar && row.status === 'checked');
      }
      const paydaysDesc = Array.from(allCheckedByPayday.keys()).sort((a, b) => (a < b ? 1 : -1));
      const today = toDateOnly(new Date());
      let streak = 0;
      for (const payday of paydaysDesc) {
        if (payday > today) continue;
        if (!allCheckedByPayday.get(payday)) break;
        streak++;
      }
      return streak;
    },
  });
}

// --- Category detail / history ----------------------------------------------

export function useCategoryHistory(categoryId: string | undefined) {
  return useQuery({
    queryKey: ['category-history', categoryId],
    enabled: !!categoryId,
    queryFn: async () => {
      // No direct FK from ledger_entries.checked_by to household_members
      // (both reference auth.users independently) so this can't be a
      // PostgREST embed - callers cross-reference useHouseholdMembers by
      // user_id themselves (see CategoryDetail).
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('*, bill_items(label)')
        .eq('category_id', categoryId as string)
        .eq('status', 'checked')
        .order('payday_date', { ascending: false })
        .order('checked_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// An extra deposit into a fund on top of the plan (`manual` rows, see
// 20260921000010_manual_contributions.sql), dated today.
export function useAddManualContribution(householdId: string | undefined) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ categoryId, amount }: { categoryId: string; amount: number }) => {
      const { data, error } = await supabase
        .from('ledger_entries')
        .insert({
          household_id: householdId as string,
          category_id: categoryId,
          bill_item_id: null,
          payday_date: toDateOnly(new Date()),
          amount,
          status: 'checked',
          manual: true,
          checked_by: session?.user.id,
          checked_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ['category-history', row.category_id] });
      queryClient.invalidateQueries({ queryKey: ['ledger-entries', householdId, row.payday_date] });
    },
  });
}

// --- Bug reports ------------------------------------------------------------

// Insert-only: bug_reports has no SELECT policy (reports are read from the
// Supabase dashboard), so don't chain .select() - returning the row would
// fail RLS. user_id and created_at are filled in by column defaults.
export function useSubmitBugReport(householdId: string | undefined) {
  return useMutation({
    mutationFn: async (description: string) => {
      const { error } = await supabase.from('bug_reports').insert({
        household_id: householdId ?? null,
        description,
        app_version: `${Application.nativeApplicationVersion ?? '?'} (${Application.nativeBuildVersion ?? '?'})`,
        platform: Platform.OS,
        os_version: String(Platform.Version),
      });
      if (error) throw error;
    },
  });
}

// --- Household chat ---------------------------------------------------------

// One thread per household, newest first (the chat screen renders an inverted
// FlatList). Capped rather than paginated: a two-person household's backlog
// isn't worth an infinite-scroll implementation.
const MESSAGE_LIMIT = 200;

export function useMessages(householdId: string | undefined) {
  return useQuery({
    queryKey: ['messages', householdId],
    enabled: !!householdId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('household_id', householdId as string)
        .order('created_at', { ascending: false })
        .limit(MESSAGE_LIMIT);
      if (error) throw error;
      return data;
    },
  });
}

export function useSendMessage(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      // sender_id defaults to auth.uid() in the DB; the insert policy also
      // requires it, so a client can never post as their partner.
      const { error } = await supabase
        .from('messages')
        .insert({ household_id: householdId as string, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages', householdId] }),
  });
}

// Own messages only (RLS). A hard delete, so it's gone for the partner too.
export function useDeleteMessage(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase.from('messages').delete({ count: 'exact' }).eq('id', id);
      if (error) throw error;
      if (count === 0) throw new Error('Message could not be deleted');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages', householdId] }),
  });
}

// Hides the thread for the caller only (a per-member marker, enforced by the
// messages read policy) - the partner's view is untouched.
export function useClearChatHistory(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('clear_chat_history', { p_household_id: householdId as string });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', householdId] });
      queryClient.invalidateQueries({ queryKey: ['messages-unread', householdId] });
    },
  });
}

// The unread badge is per-device on purpose: it's a display convenience, not
// shared household state. Storing it server-side would mean a writable
// per-member column, and household_members deliberately has no client UPDATE
// policy (see AGENTS.md) - not worth a second SECURITY DEFINER RPC for a dot.
const lastReadKey = (householdId: string) => `chat:last-read:${householdId}`;

export function useUnreadMessageCount(householdId: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['messages-unread', householdId],
    enabled: !!householdId && !!userId,
    queryFn: async () => {
      // A device with no stored mark starts from now, so a fresh install (or a
      // new phone) doesn't badge the whole history as unread.
      let since = await AsyncStorage.getItem(lastReadKey(householdId as string));
      if (!since) {
        since = new Date().toISOString();
        await AsyncStorage.setItem(lastReadKey(householdId as string), since);
      }
      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', householdId as string)
        .neq('sender_id', userId as string)
        .gt('created_at', since);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkMessagesRead(householdId: string | undefined) {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    if (!householdId) return;
    await AsyncStorage.setItem(lastReadKey(householdId), new Date().toISOString());
    await queryClient.invalidateQueries({ queryKey: ['messages-unread', householdId] });
  }, [householdId, queryClient]);
}
