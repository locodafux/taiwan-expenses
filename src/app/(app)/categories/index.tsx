import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card, CategoryMark, ListRow } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { formatPeso } from '@/lib/format';
import { ErrorState } from '@/components/ui/ErrorState';
import { fromDateOnly } from '@/lib/payday';
import {
  combineQueryState,
  useCategories,
  useCategoryBalances,
  useHouseholdBillItems,
  useHouseholdMembership,
} from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';

function describeCategory(
  c: { id: string; kind: string; rule: any },
  billCount: number,
  balance: number,
  shareTotal: number,
  categories: { id: string; name: string; kind: string; rule: any }[],
) {
  if (c.kind === 'bill') {
    return `Bill · ${billCount} recurring item${billCount === 1 ? '' : 's'}`;
  }
  if (c.rule?.type === 'excess') {
    const parent = categories.find((candidate) => candidate.id === c.rule.parent_id);
    return `Excess share · ${c.rule.percent}% of ${parent?.name ?? 'missing group'}`;
  }
  const childCount = categories.filter(
    (candidate) => candidate.rule?.type === 'excess' && candidate.rule.parent_id === c.id,
  ).length;
  const groupSuffix = c.rule?.excess_source
    ? ` · group for ${childCount} fund${childCount === 1 ? '' : 's'}`
    : '';
  if (c.rule?.type === 'goal') {
    const target = c.rule.target_amount;
    return `${c.rule.one_time ? 'One-time' : 'Goal'} · target ₱${target.toLocaleString()}${c.rule.target_date ? ` by ${fromDateOnly(c.rule.target_date).toLocaleDateString(undefined, { month: 'short' })}` : ''}${groupSuffix}`;
  }
  if (c.rule?.type === 'capped_percent') {
    return `${c.rule.percent}% of leftover${c.rule.cap ? ` · capped ₱${c.rule.cap.toLocaleString()}` : ''}${groupSuffix}`;
  }
  if (c.rule?.type === 'remainder') {
    // Shares are weights across all remainder funds (materialize_payday tier 3).
    const effective = shareTotal > 0 ? Math.round((c.rule.percent / shareTotal) * 100) : 0;
    return `${c.rule.percent}% share · gets ${effective}% of what's left${groupSuffix}`;
  }
  return '';
}

export default function CategoryManagement() {
  const { vars } = useTheme();
  const router = useRouter();
  const membershipQuery = useHouseholdMembership();
  const member = membershipQuery.data;
  const householdId = member?.household_id;
  const categoriesQuery = useCategories(householdId);
  const categories = categoriesQuery.data;
  const billItemsQuery = useHouseholdBillItems(householdId);
  const billItems = billItemsQuery.data;
  const balancesQuery = useCategoryBalances(householdId);
  const balances = balancesQuery.data;

  const { isError, refetch } = combineQueryState(
    membershipQuery,
    categoriesQuery,
    billItemsQuery,
    balancesQuery,
  );

  const shareTotal = (categories ?? []).reduce(
    (s, c) => (c.kind === 'fund' && c.rule?.type === 'remainder' ? s + c.rule.percent : s),
    0,
  );

  const billCountByCategory = (billItems ?? []).reduce<Record<string, number>>((acc, b) => {
    acc[b.category_id] = (acc[b.category_id] ?? 0) + 1;
    return acc;
  }, {});

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <ScrollView contentContainerClassName="gap-4 px-6 py-5" className="flex-1">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 font-display-semibold text-lg text-ink">Categories</Text>
          <Button size="sm" onPress={() => router.push('/(app)/categories/add')}>
            + Add
          </Button>
        </View>

        <Card>
          {(categories ?? []).map((c, i) => (
            <ListRow
              key={c.id}
              isLast={i === (categories?.length ?? 0) - 1}
              onPress={() => router.push(`/(app)/categories/${c.id}`)}
            >
              <CategoryMark color={c.color} size={32} label={c.name} />
              <View className="flex-1">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="flex-1 font-body-semibold text-base text-ink">{c.name}</Text>
                  <Text className="font-mono text-sm text-ink">{formatPeso(balances?.[c.id] ?? 0)}</Text>
                </View>
                <Text className="mt-[2px] font-body text-xs text-ink-muted">
                  {describeCategory(c, billCountByCategory[c.id] ?? 0, balances?.[c.id] ?? 0, shareTotal, categories ?? [])}
                </Text>
              </View>
              <Icon name="chevronRight" size={16} color={vars['--ink-muted']} />
            </ListRow>
          ))}
          {(categories ?? []).length === 0 && (
            <Text className="p-4 font-body text-sm text-ink-muted">No categories yet.</Text>
          )}
        </Card>

        <Text className="font-body text-xs leading-[1.5] text-ink-muted">
          Every fund category has one optional field: a target amount. Set it and the category stops
          taking a share once full; leave it blank and it keeps its share of what&apos;s left
          indefinitely. Shares are weighed against each other, so they don&apos;t need to add up to
          100.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
