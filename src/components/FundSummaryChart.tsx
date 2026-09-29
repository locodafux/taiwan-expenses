import { useState } from 'react';
import { Text, View } from 'react-native';
import { vars as nativeWindVars } from 'nativewind';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { Card } from '@/components/ui/Card';
import { Meter } from '@/components/ui/ProgressBar';
import type { Category } from '@/lib/database.types';
import { formatPeso } from '@/lib/format';
import { addMonths, APP_START_MONTH, appToday, fromDateOnly, toDateOnly } from '@/lib/payday';
import { PAYDAY_PINK } from '@/theme/tokens';

// Soft-pink scope, same as the payday calendar (see PAYDAY_PINK).
const PINK_SCOPE = nativeWindVars(PAYDAY_PINK);
const HEIGHT = 160;
const PAD = { top: 10, right: 12, bottom: 24, left: 8 };
// A line needs at least a few months of x-axis to read as a line.
const MIN_MONTHS = 3;

// The household's own fund categories are matched by name - the app has no
// fixed "Taiwan / Emergency / Savings" ids. A fund the household doesn't have
// just isn't drawn. `fallback` colors a fund whose category has none set.
const FUNDS = [
  { label: 'Taiwan Fund', match: /taiwan/i, fallback: PAYDAY_PINK['--pink'] },
  { label: 'Emergency Fund', match: /emergency/i, fallback: PAYDAY_PINK['--accent'] },
  { label: 'Savings', match: /^savings?$/i, fallback: PAYDAY_PINK['--ink-2'] },
];

function goalOf(c: Category): number | null {
  const r = c.rule;
  if (r?.type === 'goal') return r.target_amount;
  if (r?.type === 'group_child') return r.goal?.target_amount ?? null;
  if (r?.type === 'capped_percent') return r.cap ?? null;
  return null;
}

function monthLabel(month: string) {
  return fromDateOnly(`${month}-01`).toLocaleDateString(undefined, { month: 'short' });
}

// Each fund's running checked total, month by month from October 2026, as
// lines on one shared scale (`monthly` = checked ledger totals by month then
// category). The line stops at the current month; later months stay blank.
export function FundSummaryChart({
  categories,
  balances,
  monthly,
}: {
  categories: Category[];
  balances: Record<string, number> | undefined;
  monthly: Record<string, Record<string, number>> | undefined;
}) {
  const [width, setWidth] = useState(300);

  const funds = FUNDS.flatMap(({ label, match, fallback }) => {
    const c = categories.find((x) => x.kind === 'fund' && match.test(x.name));
    if (!c) return [];
    const goal = goalOf(c);
    return [{ id: c.id, label, color: c.color ?? fallback, amount: balances?.[c.id] ?? 0, goal: goal && goal > 0 ? goal : null }];
  });
  if (funds.length === 0) return null;

  const currentMonth = toDateOnly(appToday()).slice(0, 7);
  const lastMonth = currentMonth > addMonths(APP_START_MONTH, MIN_MONTHS - 1) ? currentMonth : addMonths(APP_START_MONTH, MIN_MONTHS - 1);
  const months: string[] = [];
  for (let m = APP_START_MONTH; m <= lastMonth; m = addMonths(m, 1)) months.push(m);
  const drawn = months.filter((m) => m <= currentMonth);

  const lines = funds.map((f) => {
    let run = 0;
    return { ...f, totals: drawn.map((m) => (run += monthly?.[m]?.[f.id] ?? 0)) };
  });
  const max = Math.max(...lines.flatMap((l) => l.totals));
  const empty = max <= 0;

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (months.length === 1 ? 0 : (i / (months.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (empty ? 0 : (v / max) * plotH);

  return (
    <View style={PINK_SCOPE}>
      <Card className="gap-4 p-5">
        <Text className="font-body-semibold text-xs uppercase tracking-widest text-ink-muted">Fund summary</Text>
        <View onLayout={(e) => setWidth(Math.max(200, Math.floor(e.nativeEvent.layout.width)))}>
          <Svg width={width} height={HEIGHT} accessibilityLabel="Line chart of each fund's saved total by month">
            {[0, 0.5, 1].map((t) => (
              <Line
                key={t}
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={PAD.top + plotH * t}
                y2={PAD.top + plotH * t}
                stroke={PAYDAY_PINK['--gridline']}
                strokeWidth={1}
              />
            ))}
            {months.map((m, i) => (
              <SvgText
                key={m}
                x={x(i)}
                y={HEIGHT - 6}
                fontSize={10}
                fill={PAYDAY_PINK['--ink-muted']}
                textAnchor={i === 0 ? 'start' : i === months.length - 1 ? 'end' : 'middle'}
              >
                {monthLabel(m)}
              </SvgText>
            ))}
            {lines.map((l) => (
              <G key={l.id}>
                <Polyline
                  testID={`fund-line-${l.id}`}
                  points={l.totals.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <Circle cx={x(l.totals.length - 1)} cy={y(l.totals[l.totals.length - 1])} r={3.5} fill={l.color} />
              </G>
            ))}
          </Svg>
          {!empty && (
            <Text className="absolute left-2 top-0 font-mono text-[10px] text-ink-muted">{formatPeso(max)}</Text>
          )}
        </View>
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
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
        {empty && (
          <Text className="text-center font-body text-xs text-ink-muted">
            Nothing saved yet — the lines rise as you tick off paydays.
          </Text>
        )}
      </Card>
    </View>
  );
}
