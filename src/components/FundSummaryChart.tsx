import { Text, View } from 'react-native';
import { vars as nativeWindVars } from 'nativewind';

import { Card } from '@/components/ui/Card';
import { Meter } from '@/components/ui/ProgressBar';
import type { Category } from '@/lib/database.types';
import { formatPeso } from '@/lib/format';
import { buildPlan, total } from '@/lib/paydayPlan';
import { PAYDAY_PINK } from '@/theme/tokens';

// Soft-pink scope, same as the payday calendar (see PAYDAY_PINK).
const PINK_SCOPE = nativeWindVars(PAYDAY_PINK);

// The household's own fund categories are matched by name - the app has no
// fixed "Taiwan / Emergency / Savings" ids. A fund the household doesn't have
// just isn't drawn. `fallback` colors a fund whose category has none set;
// `planKey` is the fund's column in the Breakdown payday plan.
const FUNDS = [
  { label: 'Taiwan Fund', match: /taiwan/i, fallback: PAYDAY_PINK['--pink'], planKey: 'taiwan' },
  { label: 'Emergency Fund', match: /emergency/i, fallback: PAYDAY_PINK['--accent'], planKey: 'emergency' },
  { label: 'Savings', match: /^savings?$/i, fallback: PAYDAY_PINK['--ink-2'], planKey: 'savings' },
] as const;

function goalOf(c: Category): number | null {
  const r = c.rule;
  if (r?.type === 'goal') return r.target_amount;
  if (r?.type === 'group_child') return r.goal?.target_amount ?? null;
  if (r?.type === 'capped_percent') return r.cap ?? null;
  return null;
}

// Each fund's saved total with its progress meter. A fund with a stored goal
// measures against it; otherwise against the Breakdown plan's total by March.
export function FundSummaryChart({
  categories,
  balances,
}: {
  categories: Category[];
  balances: Record<string, number> | undefined;
}) {
  const funds = FUNDS.flatMap(({ label, match, fallback, planKey }) => {
    const c = categories.find((x) => x.kind === 'fund' && match.test(x.name));
    if (!c) return [];
    const stored = goalOf(c);
    // No stored goal: fall back to the fund's planned total by the last plan
    // payday (March 2027), the same figure the Breakdown calendar shows.
    const fromPlan = !(stored && stored > 0);
    const goal = fromPlan ? total(buildPlan().paydays, planKey) : (stored as number);
    return [{ id: c.id, label, color: c.color ?? fallback, amount: balances?.[c.id] ?? 0, goal: goal > 0 ? goal : null, fromPlan }];
  });
  if (funds.length === 0) return null;

  const empty = funds.every((f) => f.amount <= 0);

  return (
    <View style={PINK_SCOPE}>
      <Card className="gap-4 p-5">
        <Text className="font-body-semibold text-xs uppercase tracking-widest text-ink-muted">Fund summary</Text>
        <View className="gap-2">
          {funds.map((f) => (
            <View key={f.id} className="gap-1">
              <View className="flex-row items-center gap-2">
                <View style={{ backgroundColor: f.color }} className="h-[10px] w-[10px] rounded-full" />
                <Text className="flex-1 font-body-semibold text-xs text-ink-2">{f.label}</Text>
                <Text className="font-mono text-xs text-ink">{formatPeso(f.amount)}</Text>
              </View>
              {f.goal != null && (
                <View className="gap-1">
                  <Meter thin percent={(f.amount / f.goal) * 100} color={PAYDAY_PINK['--accent']} />
                  <Text className="font-body text-[11px] text-ink-muted">
                    {Math.min(100, Math.floor((f.amount / f.goal) * 100))}% of {formatPeso(f.goal)}
                    {f.fromPlan ? ' (plan by March)' : ''}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
        {empty && (
          <Text className="text-center font-body text-xs text-ink-muted">
            Nothing saved yet — it grows as you tick off paydays.
          </Text>
        )}
      </Card>
    </View>
  );
}
