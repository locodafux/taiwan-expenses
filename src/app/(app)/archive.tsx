import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, ListRow } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/ErrorState';
import { archiveRowLabel, groupArchive, type ArchiveRow } from '@/lib/archive';
import { formatFolioDate, formatPeso } from '@/lib/format';
import { fromDateOnly } from '@/lib/payday';
import { combineQueryState, useCheckedLedgerArchive, useHouseholdMembership } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';

function Rows({ heading, rows }: { heading: string; rows: ArchiveRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <Text className="px-4 pb-1 pt-3 font-body-semibold text-xs text-ink-muted">{heading}</Text>
      {rows.map((r, i) => (
        <ListRow key={r.id} isLast={i === rows.length - 1}>
          <Text className="flex-1 font-body-semibold text-sm text-ink">
            {archiveRowLabel(r)}
            {r.manual ? ' · extra' : ''}
          </Text>
          <Text className="font-mono text-sm text-ink">{formatPeso(r.amount)}</Text>
        </ListRow>
      ))}
    </>
  );
}

export default function Archive() {
  const { vars } = useTheme();
  const router = useRouter();
  const membershipQuery = useHouseholdMembership();
  const archiveQuery = useCheckedLedgerArchive(membershipQuery.data?.household_id);
  const { isError, refetch } = combineQueryState(membershipQuery, archiveQuery);
  const paydays = useMemo(() => groupArchive((archiveQuery.data ?? []) as ArchiveRow[]), [archiveQuery.data]);

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  if (membershipQuery.isLoading || archiveQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-page">
        <ActivityIndicator color={vars['--accent']} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <ScrollView contentContainerClassName="gap-4 px-6 py-5" className="flex-1">
        <Pressable
          onPress={() => router.navigate('/(app)/settings')}
          hitSlop={13}
          accessibilityRole="button"
          className="-mb-1 self-start py-1"
        >
          <Text className="font-body text-sm text-ink-2">‹ Settings</Text>
        </Pressable>
        <Text className="font-display-semibold text-lg text-ink">Payday archive</Text>

        <View className="gap-3">
          {paydays.map((p) => (
            <Card key={p.date} className="overflow-hidden">
              <ListRow className="bg-surface-2">
                <Text className="flex-1 font-body-semibold text-sm text-ink">
                  {formatFolioDate(fromDateOnly(p.date))}
                </Text>
                <Text className="font-mono text-xs text-ink-muted">{formatPeso(p.total)}</Text>
              </ListRow>
              <Rows heading="Bills" rows={p.bills} />
              <Rows heading="Funds" rows={p.funds} />
            </Card>
          ))}
          {paydays.length === 0 && (
            <Card>
              <Text className="p-4 font-body text-sm text-ink-muted">Nothing ticked off yet.</Text>
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
