import { Text, View } from 'react-native';
import { vars as nativeWindVars } from 'nativewind';

import { Card } from '@/components/ui/Card';
import { Meter } from '@/components/ui/ProgressBar';
import type { Category } from '@/lib/database.types';
import { formatPeso } from '@/lib/format';
import { PAYDAY_PINK } from '@/theme/tokens';

// Soft-pink scope, same as the payday calendar (see PAYDAY_PINK).
const PINK_SCOPE = nativeWindVars(PAYDAY_PINK);
const BAR_HEIGHT = 120;

// The household's own fund categories are matched by name - the app has no
// fixed "Taiwan / Emergency / Savings" ids. A fund the household doesn't have
// just isn't drawn.
const FUNDS = [
  { label: 'Taiwan Fund', match: /taiwan/i },
  { label: 'Emergency Fund', match: /emergency/i },
  { label: 'Savings', match: /^savings?$/i },
];

function goalOf(c: Category): number | null {
  const r = c.rule;
  if (r?.type === 'goal') return r.target_amount;
  if (r?.type === 'group_child') return r.goal?.target_amount ?? null;
  if (r?.type === 'capped_percent') return r.cap ?? null;
  return null;
}

// Checked-so-far per fund (balances already start in October 2026), as three
// bars on one shared scale. Plain Views, like the Breakdown month chart.
export function FundSummaryChart({
  categories,
  balances,
}: {
  categories: Category[];
  balances: Record<string, number> | undefined;
}) {
  const bars = FUNDS.flatMap(({ label, match }) => {
    const c = categories.find((x) => x.kind === 'fund' && match.test(x.name));
    if (!c) return [];
    const goal = goalOf(c);
    return [{ id: c.id, label, amount: balances?.[c.id] ?? 0, goal: goal && goal > 0 ? goal : null }];
  });
  if (bars.length === 0) return null;

  const max = Math.max(...bars.map((b) => b.amount));
  const empty = max <= 0;

  return (
    <View style={PINK_SCOPE}>
      <Card className="gap-4 p-5">
        <Text className="font-body-semibold text-xs uppercase tracking-widest text-ink-muted">Fund summary</Text>
        <View className="flex-row gap-3">
          {bars.map((b) => (
            <View key={b.id} className="flex-1 items-center gap-2">
              <Text className="font-mono text-xs text-ink">{formatPeso(b.amount)}</Text>
              <View style={{ height: BAR_HEIGHT }} className="w-full justify-end overflow-hidden rounded-md bg-surface-2">
                <View
                  testID={`fund-bar-${b.id}`}
                  style={{
                    height: b.amount > 0 ? Math.max(4, (b.amount / max) * BAR_HEIGHT) : 0,
                    backgroundColor: PAYDAY_PINK['--pink'],
                  }}
                  className="w-full"
                />
              </View>
              <Text className="text-center font-body-semibold text-xs text-ink-2">{b.label}</Text>
              {b.goal != null && (
                <View className="w-full gap-1">
                  <Meter thin percent={(b.amount / b.goal) * 100} color={PAYDAY_PINK['--accent']} />
                  <Text className="text-center font-body text-[11px] text-ink-muted">
                    {Math.min(100, Math.floor((b.amount / b.goal) * 100))}% of {formatPeso(b.goal)}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
        {empty && (
          <Text className="text-center font-body text-xs text-ink-muted">
            Nothing saved yet — the bars fill in as you tick off paydays.
          </Text>
        )}
      </Card>
    </View>
  );
}
