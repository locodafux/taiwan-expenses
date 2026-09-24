import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ColorPicker, useCategoryColors } from '@/components/ui/ColorPicker';
import { KeyboardScroll } from '@/components/ui/KeyboardScroll';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { ErrorState } from '@/components/ui/ErrorState';
import { TextField } from '@/components/ui/TextField';
import { parseAmount } from '@/lib/format';
import { nextMonth } from '@/lib/payday';
import { combineQueryState, useCreateCategory, useHouseholdMembership } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';

type Kind = 'fund' | 'bill';

const inputClass = 'mt-2 rounded-md border border-border bg-surface px-4 py-4 font-body text-base text-ink';

export default function AddCategory() {
  const router = useRouter();
  const { vars } = useTheme();
  const membershipQuery = useHouseholdMembership();
  const member = membershipQuery.data;
  const createCategory = useCreateCategory(member?.household_id);

  const { isError, refetch } = combineQueryState(membershipQuery);

  const colorOptions = useCategoryColors();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('fund');
  const [color, setColor] = useState(colorOptions[4].value);
  const [target, setTarget] = useState('');
  // Goal deadline month ('YYYY-MM'); stored as rule.target_date = its 1st.
  const [deadline, setDeadline] = useState<string | null>(null);
  const [oneTime, setOneTime] = useState(false);
  // Weight in the leftover split, not a hard percent - see the hint below.
  const [share, setShare] = useState('20');
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) return setError('Name is required');
    const parsedTarget = parseAmount(target);
    if (target && !(parsedTarget > 0)) return setError('Enter a valid target amount');
    const parsedShare = parseAmount(share);
    if (kind === 'fund' && !target && !(parsedShare > 0 && parsedShare <= 100)) {
      return setError('Enter a share between 1 and 100');
    }
    setError(null);
    try {
      await createCategory.mutateAsync({
        name: name.trim(),
        kind,
        color,
        rule:
          kind === 'fund'
            ? ({
                type: target ? 'goal' : 'remainder',
                target_amount: target ? parsedTarget : 0,
                percent: target ? undefined : parsedShare,
                target_date: target && deadline ? `${deadline}-01` : undefined,
                one_time: target ? oneTime : undefined,
              } as any)
            : undefined,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save category');
    }
  }

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <KeyboardScroll contentContainerClassName="gap-4 px-6 py-5">
        <Pressable onPress={() => router.back()} hitSlop={13} className="self-start py-3">
          <Text className="font-body text-sm text-ink-2">‹ Categories</Text>
        </Pressable>
        <Text className="font-display-semibold text-lg text-ink">New category</Text>

        <View>
          <Text className="font-body text-xs text-ink-muted">Name</Text>
          <TextField
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder="e.g. New laptop fund"
            className={inputClass}
          />
        </View>

        <View>
          <Text className="mb-2 font-body text-xs text-ink-muted">Type</Text>
          <View className="flex-row gap-1 rounded-md border border-border bg-surface-2 p-1">
            {(['fund', 'bill'] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                className={`flex-1 items-center rounded-sm px-2 py-3 ${kind === k ? 'bg-surface' : ''}`}
              >
                <Text className={`font-body-semibold text-xs ${kind === k ? 'text-ink' : 'text-ink-2'}`}>
                  {k === 'fund' ? 'Fund (savings goal)' : 'Bill (recurring expense)'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Text className="mb-2 font-body text-xs text-ink-muted">Color</Text>
          <ColorPicker value={color} onChange={setColor} />
        </View>

        {kind === 'bill' && (
          <Text className="font-body text-xs leading-[1.4] text-ink-muted">
            Amounts live on the bills inside this category. Open it after saving to add them.
          </Text>
        )}
        {kind === 'fund' && (
          <View>
            <Text className="font-body text-xs text-ink-muted">Target amount (optional)</Text>
            <TextField
              value={target}
              onChangeText={setTarget}
              placeholder="Leave blank for no limit"
              keyboardType="numeric"
              className={`${inputClass} font-mono`}
            />
            <Text className="mt-1 font-body text-xs leading-[1.4] text-ink-muted">
              Set it and this category stops taking a share once full. Leave blank and it keeps its
              percentage share indefinitely.
            </Text>
          </View>
        )}
        {kind === 'fund' && target === '' && (
          <View>
            <Text className="font-body text-xs text-ink-muted">Share of what&apos;s left (%)</Text>
            <TextField
              value={share}
              onChangeText={setShare}
              keyboardType="numeric"
              className={`${inputClass} font-mono`}
            />
            <Text className="mt-1 font-body text-xs leading-[1.4] text-ink-muted">
              The money left over each month is split between funds like this one by their shares.
              Shares are weighed against each other: two funds at 30 and 20 get 60% and 40%.
            </Text>
          </View>
        )}
        {kind === 'fund' && target !== '' && (
          <View className="gap-2">
            <Text className="font-body text-xs text-ink-muted">Complete by (optional)</Text>
            <MonthPicker
              value={deadline}
              min={nextMonth()}
              onChange={setDeadline}
              emptyLabel="No deadline · set a month"
            />
            <Text className="font-body text-xs leading-[1.4] text-ink-muted">
              Saving is spread over the months before this one.
            </Text>
            <View className="flex-row items-center gap-3">
              <View className="flex-1">
                <Text className="font-body text-base text-ink">One-time expense</Text>
                <Text className="font-body text-xs leading-[1.4] text-ink-muted">
                  Like a trip: taken in one go from the first month with room, instead of spread out.
                </Text>
              </View>
              <Switch
                accessibilityLabel="One-time expense"
                value={oneTime}
                onValueChange={setOneTime}
                trackColor={{ true: vars['--accent'] }}
              />
            </View>
          </View>
        )}

        {error && <Text className="font-body text-sm text-status-bad">{error}</Text>}

        <View className="flex-row gap-3">
          <Button variant="secondary" className="flex-1" onPress={() => router.back()}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            loading={createCategory.isPending}
            onPress={handleSave}
          >
            Add category
          </Button>
        </View>
      </KeyboardScroll>
    </SafeAreaView>
  );
}
