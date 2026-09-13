import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from './auth';
import { toDateOnly } from './payday';
import { supabase } from './supabase';
import type { Category, CategoryRule } from './database.types';

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

export function useCreateBillItem(categoryId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { label: string; amount: number; recurring_day: number; end_date?: string }) => {
      const { data, error } = await supabase
        .from('bill_items')
        .insert({ category_id: categoryId as string, ...input })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bill-items', categoryId] }),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-entries', householdId, paydayDate] });
      queryClient.invalidateQueries({ queryKey: ['category-history'] });
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
        .select('*')
        .eq('category_id', categoryId as string)
        .eq('status', 'checked')
        .order('checked_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ponytail: an ad-hoc contribution on the same date as an already-materialized
// payday for this category will collide with ledger_entries_fund_occurrence's
// unique index (category_id, payday_date) - fine for today's v1 (manual
// add-ons are rare/same-day edge case), revisit if that turns out common.
export function useAddManualContribution(categoryId: string | undefined, householdId: string | undefined) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ amount }: { amount: number }) => {
      const today = toDateOnly(new Date());
      const { data, error } = await supabase
        .from('ledger_entries')
        .insert({
          household_id: householdId as string,
          category_id: categoryId as string,
          bill_item_id: null,
          payday_date: today,
          amount,
          status: 'checked',
          checked_by: session?.user.id,
          checked_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['category-history', categoryId] }),
  });
}
