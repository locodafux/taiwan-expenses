import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/ErrorState';
import { combineQueryState, useCreateBillItem, useCreateCategory, useHouseholdMembership } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';

type Kind = 'fund' | 'bill';

const inputClass = 'mt-2 rounded-md border border-border bg-page px-4 py-4 font-body text-base text-ink';

export default function AddCategorySheet() {
  const router = useRouter();
  const { vars } = useTheme();
  const membershipQuery = useHouseholdMembership();
  const member = membershipQuery.data;
  const createCategory = useCreateCategory(member?.household_id);
  const createBillItem = useCreateBillItem(undefined);

  const { isError, refetch } = combineQueryState(membershipQuery);

  const colorOptions = [
    { value: vars['--cat-expenses'], name: 'Blue' },
    { value: vars['--cat-debt'], name: 'Rust' },
    { value: vars['--cat-taiwan'], name: 'Teal' },
    { value: vars['--cat-emergency'], name: 'Gold' },
    { value: vars['--cat-savings'], name: 'Pink' },
    { value: vars['--cat-pinatubo'], name: 'Green' },
    { value: vars['--cat-excess'], name: 'Brown' },
  ];

  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('fund');
  const [color, setColor] = useState(colorOptions[4].value);
  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [payday, setPayday] = useState(5);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) return setError('Name is required');
    if (kind === 'bill' && !amount) return setError('Amount is required for a bill');
    setError(null);
    try {
      const category = await createCategory.mutateAsync({
        name: name.trim(),
        kind,
        color,
        rule:
          kind === 'fund'
            ? ({
                type: target ? 'goal' : 'remainder',
                target_amount: Number(target) || 0,
                percent: target ? undefined : 20,
              } as any)
            : undefined,
      });
      if (kind === 'bill') {
        await createBillItem.mutateAsync({
          category_id: category.id,
          label: name.trim(),
          amount: Number(amount),
          recurring_day: payday,
        });
      }
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
    <SafeAreaView className="flex-1 justify-end bg-black/30">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          className="max-h-[90%] rounded-t-2xl bg-surface"
          contentContainerClassName="gap-5 p-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="self-center h-1 w-9 rounded-full bg-baseline" />
          <Text className="font-display-semibold text-lg text-ink">New category</Text>

          <View>
            <Text className="font-body text-xs text-ink-muted">Name</Text>
            <TextInput
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
            <View className="flex-row flex-wrap gap-3">
              {colorOptions.map((c) => (
                <Pressable
                  key={c.value}
                  onPress={() => setColor(c.value)}
                  accessibilityLabel={c.name}
                  accessibilityRole="button"
                  className="h-14 w-14 items-center justify-center rounded-full"
                  style={{
                    backgroundColor: c.value,
                    borderWidth: color === c.value ? 3 : 0,
                    borderColor: vars['--ink'],
                  }}
                />
              ))}
            </View>
          </View>

          {kind === 'bill' && (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="font-body text-xs text-ink-muted">Amount</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="₱0"
                  keyboardType="numeric"
                  className={`${inputClass} font-mono`}
                />
              </View>
              <View className="flex-1">
                <Text className="font-body text-xs text-ink-muted">Paid from</Text>
                <ScrollView horizontal className="mt-2">
                  {[5, 15, 20, 30].map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => setPayday(p)}
                      className={`mr-2 rounded-md border px-3 py-3 ${
                        payday === p ? 'border-accent bg-accent-soft' : 'border-border'
                      }`}
                    >
                      <Text className="font-body text-sm text-ink">{p}th</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>
          )}
          {kind === 'fund' && (
            <View>
              <Text className="font-body text-xs text-ink-muted">Target amount (optional)</Text>
              <TextInput
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

          {error && <Text className="font-body text-sm text-status-bad">{error}</Text>}

          <View className="flex-row gap-3">
            <Button variant="secondary" className="flex-1" onPress={() => router.back()}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              loading={createCategory.isPending || createBillItem.isPending}
              onPress={handleSave}
            >
              Add category
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
