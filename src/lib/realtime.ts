import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from './supabase';

// docs/techspec.md §3 ("decided": live partner updates) - one channel per
// household, invalidating the affected query rather than hand-patching the
// cache row-by-row. techspec explicitly warned that per-row reducers are
// "non-trivial code" not worth it for a 2-user household; invalidate-on-change
// is the simpler, still-correct version of "additive on top of TanStack Query".
export function useRealtimeSync(householdId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!householdId) return;

    const channel = supabase
      .channel(`household-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories', filter: `household_id=eq.${householdId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['categories', householdId] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incomes', filter: `household_id=eq.${householdId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['incomes', householdId] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bill_items', filter: `household_id=eq.${householdId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['bill-items-household', householdId] });
          queryClient.invalidateQueries({ queryKey: ['bill-items'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ledger_entries', filter: `household_id=eq.${householdId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['ledger-entries', householdId] });
          queryClient.invalidateQueries({ queryKey: ['category-balances', householdId] });
          queryClient.invalidateQueries({ queryKey: ['category-history'] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, queryClient]);
}
