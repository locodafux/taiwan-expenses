import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, BackHandler, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { KeyboardScroll } from '@/components/ui/KeyboardScroll';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { TextField } from '@/components/ui/TextField';
import { Card, ListRow } from '@/components/ui/Card';
import { DeleteCategorySheet } from '@/components/ui/DeleteCategorySheet';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatPeso } from '@/lib/format';
import { fromDateOnly, monthDueDate, nextMonth, paymentsLeft, toDateOnly } from '@/lib/payday';
import {
  combineQueryState,
  useAddManualContribution,
  useBillItems,
  useCategories,
  useCategoryHistory,
  useCreateBillItem,
  useDeleteBillItem,
  useDeleteCategory,
  useHouseholdMembers,
  useHouseholdMembership,
  useUpdateBillItem,
  useUpdateCategory,
} from '@/lib/queries';

// Retired items (end_date passed) are hidden, so there's always >= 1 left here.
function termLabel(recurringDay: number, endDate: string) {
  const left = paymentsLeft(recurringDay, endDate);
  const until = fromDateOnly(endDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return `${left} payment${left === 1 ? '' : 's'} left · until ${until}`;
}

export default function CategoryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  // Opened from the Dashboard/Checklist, this screen is the only route in the
  // Categories stack, so router.back() would fall through to the tab history
  // (e.g. the Dashboard). dismissTo pops to the list, or replaces this screen
  // with it when it isn't underneath. Android's hardware back does the same.
  const backToList = useCallback(() => router.dismissTo('/(app)/categories'), [router]);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        backToList();
        return true;
      });
      return () => sub.remove();
    }, [backToList]),
  );
  const membershipQuery = useHouseholdMembership();
  const member = membershipQuery.data;
  const householdId = member?.household_id;
  const categoriesQuery = useCategories(householdId, { includeArchived: true });
  const categories = categoriesQuery.data;
  const category = categories?.find((c) => c.id === id);

  const historyQuery = useCategoryHistory(id);
  const history = historyQuery.data;
  const membersQuery = useHouseholdMembers(householdId);
  const members = membersQuery.data;
  const billItemsQuery = useBillItems(category?.kind === 'bill' ? id : undefined);
  const billItems = billItemsQuery.data;

  const addContribution = useAddManualContribution(householdId);
  const createBillItem = useCreateBillItem(id);
  const deleteCategory = useDeleteCategory(householdId);
  const updateCategory = useUpdateCategory(householdId);
  const updateBillItem = useUpdateBillItem(id);
  const deleteBillItem = useDeleteBillItem(id);

  const { isError, refetch } = combineQueryState(
    membershipQuery,
    categoriesQuery,
    historyQuery,
    membersQuery,
    billItemsQuery,
  );

  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [billLabel, setBillLabel] = useState('');
  const [billDay, setBillDay] = useState('5');
  // Last month the bill is paid ('YYYY-MM'); null = never ends.
  const [billUntil, setBillUntil] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The bill form doubles as the edit form for an existing line item.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState(false);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editTarget, setEditTarget] = useState('');
  // Goal deadline month ('YYYY-MM'); null = no deadline.
  const [editDeadline, setEditDeadline] = useState<string | null>(null);

  const balance = useMemo(
    () => (history ?? []).reduce((s, h) => s + h.amount, 0),
    [history],
  );
  const paidThisMonth = useMemo(() => {
    const now = new Date();
    return (history ?? [])
      .filter((h) => {
        const d = fromDateOnly(h.payday_date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((s, h) => s + h.amount, 0);
  }, [history]);

  const today = toDateOnly(new Date());
  const activeBillItems = (billItems ?? []).filter((b) => !b.end_date || b.end_date >= today);

  function closeBillForm() {
    setAdding(false);
    setEditingItemId(null);
    setBillLabel('');
    setAmount('');
    setBillDay('5');
    setBillUntil(null);
    setError(null);
  }

  function memberName(userId: string | null) {
    if (!userId) return 'Manual entry';
    return members?.find((m) => m.user_id === userId)?.display_name ?? 'Manual entry';
  }

  // Captain's intent: the history is read a month at a time, keeping the last
  // 12. The query itself stays all-time (the balance, goal progress and the
  // delete sheet's "what you'd lose" all sum it), so the cap is applied here.
  const months = useMemo(() => {
    const byMonth = new Map<string, typeof history>();
    for (const h of history ?? []) {
      const key = h.payday_date.slice(0, 7);
      byMonth.set(key, [...(byMonth.get(key) ?? []), h]);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .slice(0, 12)
      .map(([key, rows]) => ({
        key,
        label: fromDateOnly(`${key}-01`).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        }),
        rows: rows ?? [],
        total: (rows ?? []).reduce((s, r) => s + r.amount, 0),
      }));
  }, [history]);

  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <ErrorState onRetry={refetch} />
      </SafeAreaView>
    );
  }

  if (!category) return null;

  const goal = category.rule?.type === 'goal' ? category.rule.target_amount : null;
  const pct = goal ? Math.min(1, balance / goal) : null;

  function startEditingCategory() {
    setEditName(category!.name);
    setEditColor(category!.color ?? '');
    setEditTarget(goal ? String(goal) : '');
    setEditDeadline(category!.rule?.type === 'goal' ? (category!.rule.target_date?.slice(0, 7) ?? null) : null);
    setError(null);
    setEditingCategory(true);
  }

  async function handleSaveCategory() {
    if (!editName.trim()) return setError('Name is required');
    const rule = category!.rule;
    let nextRule = rule;
    if (rule?.type === 'goal') {
      const parsedTarget = Number(editTarget);
      if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
        return setError('Enter a valid target amount');
      }
      nextRule = {
        ...rule,
        target_amount: parsedTarget,
        target_date: editDeadline ? `${editDeadline}-01` : null,
      };
    }
    setError(null);
    try {
      await updateCategory.mutateAsync({
        id: category!.id,
        name: editName.trim(),
        color: editColor || null,
        rule: nextRule,
      });
      setEditingCategory(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save category');
    }
  }

  function startEditingItem(item: NonNullable<typeof billItems>[number]) {
    setEditingItemId(item.id);
    setBillLabel(item.label);
    setAmount(String(item.amount));
    setBillDay(String(item.recurring_day));
    setBillUntil(item.end_date?.slice(0, 7) ?? null);
    setError(null);
    setAdding(true);
  }

  function handleDeleteItem() {
    const item = billItems?.find((b) => b.id === editingItemId);
    if (!item) return;
    Alert.alert(
      `Delete ${item.label}?`,
      'It stops appearing on future checklists. Payments already checked off stay in the history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBillItem.mutateAsync(item.id);
              closeBillForm();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete item');
            }
          },
        },
      ],
    );
  }

  async function handleConfirmDelete() {
    try {
      await deleteCategory.mutateAsync(category!.id);
      setConfirmingDelete(false);
      backToList();
    } catch (e) {
      setConfirmingDelete(false);
      Alert.alert('Could not delete category', e instanceof Error ? e.message : 'Try again.');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <KeyboardScroll contentContainerClassName="gap-4 px-6 py-5">
        <Pressable onPress={backToList} hitSlop={13} accessibilityRole="button" className="self-start py-3">
          <Text className="font-body text-sm text-ink-2">‹ Back</Text>
        </Pressable>

        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 flex-row items-center gap-3">
            <View className="h-3 w-3 rounded" style={{ backgroundColor: category.color ?? '#999' }} />
            <Text className="flex-1 font-display-semibold text-lg text-ink" numberOfLines={1}>
              {category.name}
            </Text>
          </View>
          <Button size="sm" variant="secondary" onPress={startEditingCategory}>
            Edit
          </Button>
          <Button size="sm" onPress={() => (adding ? closeBillForm() : setAdding(true))}>
            {category.kind === 'fund' ? '+ Add contribution' : '+ Add item'}
          </Button>
        </View>

        {editingCategory && (
          <Animated.View entering={FadeInDown.duration(200)}>
            <Card className="gap-3 p-4">
              <Text className="font-body text-xs text-ink-muted">Name</Text>
              <TextField
                value={editName}
                onChangeText={setEditName}
                className="rounded-md border border-border bg-page px-4 py-4 font-body text-base text-ink"
              />
              <Text className="font-body text-xs text-ink-muted">Color</Text>
              <ColorPicker value={editColor} onChange={setEditColor} />
              {goal !== null && (
                <>
                  <Text className="font-body text-xs text-ink-muted">Target amount</Text>
                  <TextField
                    value={editTarget}
                    onChangeText={setEditTarget}
                    keyboardType="numeric"
                    className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
                  />
                  <Text className="font-body text-xs text-ink-muted">Complete by (optional)</Text>
                  <MonthPicker
                    value={editDeadline}
                    min={nextMonth()}
                    onChange={setEditDeadline}
                    emptyLabel="No deadline · set a month"
                  />
                </>
              )}
              {error && <Text className="font-body text-sm text-status-bad">{error}</Text>}
              <View className="flex-row gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onPress={() => {
                    setEditingCategory(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  disabled={!editName.trim()}
                  loading={updateCategory.isPending}
                  onPress={handleSaveCategory}
                >
                  Save
                </Button>
              </View>
            </Card>
          </Animated.View>
        )}

        <Card className="p-4">
          <Text className="font-mono text-2xl" style={{ color: category.color ?? undefined }}>
            {formatPeso(category.kind === 'bill' ? paidThisMonth : balance)}
          </Text>
          <Text className="mt-1 font-body text-xs text-ink-muted">
            {goal
              ? `of ${formatPeso(goal)} goal${category.rule?.type === 'goal' && category.rule.target_date ? ` · complete by ${fromDateOnly(category.rule.target_date).toLocaleDateString(undefined, { month: 'long' })}` : ''}`
              : category.kind === 'bill'
                ? 'paid this month'
                : 'all-time, no cap'}
          </Text>
          {pct !== null && (
            <View className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3">
              <View
                className="h-full rounded-full"
                style={{ width: `${pct * 100}%`, backgroundColor: category.color ?? '#999' }}
              />
            </View>
          )}
        </Card>

        {adding && category.kind === 'fund' && (
          <Animated.View entering={FadeInDown.duration(200)}>
            <Card className="gap-3 p-4">
              <Text className="font-body text-xs text-ink-muted">Amount</Text>
              <TextField
                autoFocus
                value={amount}
                onChangeText={setAmount}
                placeholder="₱0"
                keyboardType="numeric"
                className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
              />
              {error && <Text className="font-body text-sm text-status-bad">{error}</Text>}
              <View className="flex-row gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onPress={() => {
                    setAdding(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  disabled={!amount}
                  loading={addContribution.isPending}
                  onPress={async () => {
                    const parsedAmount = Number(amount);
                    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                      return setError('Enter a valid amount');
                    }
                    setError(null);
                    try {
                      await addContribution.mutateAsync({ categoryId: id, amount: parsedAmount });
                      setAmount('');
                      setAdding(false);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Could not save contribution');
                    }
                  }}
                >
                  Save
                </Button>
              </View>
            </Card>
          </Animated.View>
        )}

        {adding && category.kind === 'bill' && (
          <Animated.View entering={FadeInDown.duration(200)}>
            <Card className="gap-3 p-4">
              <Text className="font-body text-xs text-ink-muted">Label</Text>
              <TextField
                value={billLabel}
                onChangeText={setBillLabel}
                placeholder="e.g. Internet"
                className="rounded-md border border-border bg-page px-4 py-4 font-body text-base text-ink"
              />
              <Text className="font-body text-xs text-ink-muted">Amount</Text>
              <TextField
                value={amount}
                onChangeText={setAmount}
                placeholder="₱0"
                keyboardType="numeric"
                className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
              />
              <Text className="font-body text-xs text-ink-muted">Recurring day (1-31)</Text>
              <TextField
                value={billDay}
                onChangeText={setBillDay}
                keyboardType="numeric"
                className="rounded-md border border-border bg-page px-4 py-4 font-mono text-base text-ink"
              />
              <Text className="font-body text-xs text-ink-muted">Paid until (optional)</Text>
              <MonthPicker value={billUntil} min={today.slice(0, 7)} onChange={setBillUntil} />
              <Text className="font-body text-xs leading-[1.4] text-ink-muted">
                For loans and installments: the month of the last payment. It drops off the
                checklist after that.
              </Text>
              {error && <Text className="font-body text-sm text-status-bad">{error}</Text>}
              <View className="flex-row gap-3">
                <Button variant="secondary" className="flex-1" onPress={closeBillForm}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  disabled={!billLabel || !amount}
                  loading={createBillItem.isPending || updateBillItem.isPending}
                  onPress={async () => {
                    const parsedAmount = Number(amount);
                    const parsedDay = Number(billDay);
                    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
                      return setError('Enter a valid amount');
                    }
                    if (!Number.isInteger(parsedDay) || parsedDay < 1 || parsedDay > 31) {
                      return setError('Recurring day must be between 1 and 31');
                    }
                    const endDate = billUntil ? monthDueDate(parsedDay, billUntil) : null;
                    if (endDate && endDate < today) {
                      return setError("That month's payment date has already passed");
                    }
                    setError(null);
                    const input = {
                      label: billLabel,
                      amount: parsedAmount,
                      recurring_day: parsedDay,
                      end_date: endDate,
                    };
                    const editing = billItems?.find((b) => b.id === editingItemId);
                    try {
                      if (editing) {
                        await updateBillItem.mutateAsync({
                          id: editing.id,
                          // A shortened term can leave a pending row past the new end_date.
                          dayChanged:
                            editing.recurring_day !== parsedDay || editing.end_date !== input.end_date,
                          ...input,
                        });
                      } else {
                        await createBillItem.mutateAsync(input);
                      }
                      closeBillForm();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Could not save item');
                    }
                  }}
                >
                  Save
                </Button>
              </View>
              {editingItemId && (
                <Button
                  variant="danger"
                  loading={deleteBillItem.isPending}
                  onPress={handleDeleteItem}
                >
                  Delete item
                </Button>
              )}
            </Card>
          </Animated.View>
        )}

        {category.kind === 'bill' && (
          <View>
            <Text className="mb-2 font-body-bold text-sm text-ink">Line items</Text>
            <Card>
              {activeBillItems.map((b, i) => (
                <ListRow
                  key={b.id}
                  isLast={i === activeBillItems.length - 1}
                  onPress={() => startEditingItem(b)}
                >
                  <View className="flex-1">
                    <Text className="font-body-semibold text-base text-ink">{b.label}</Text>
                    <Text className="mt-[2px] font-body text-xs text-ink-muted">
                      On the {b.recurring_day}th{b.end_date ? ` · ${termLabel(b.recurring_day, b.end_date)}` : ''}
                    </Text>
                  </View>
                  <Text className="font-mono text-sm text-ink">{formatPeso(b.amount)}</Text>
                </ListRow>
              ))}
              {activeBillItems.length === 0 && (
                <Text className="p-4 font-body text-sm text-ink-muted">No line items yet.</Text>
              )}
            </Card>
          </View>
        )}

        <View>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="font-body-bold text-sm text-ink">History</Text>
            {category.kind === 'bill' && (
              <Pressable onPress={() => router.push('/(app)/checklist')}>
                <Text className="font-body text-xs text-ink-2">This payday&apos;s checklist ›</Text>
              </Pressable>
            )}
          </View>
          <View className="gap-3">
            {months.map((month) => (
              <Card key={month.key} className="overflow-hidden">
                <ListRow className="bg-surface-2">
                  <Text className="flex-1 font-body-semibold text-sm text-ink">{month.label}</Text>
                  <Text className="font-mono text-xs text-ink-muted">{formatPeso(month.total)}</Text>
                </ListRow>
                {month.rows.map((h, i) => (
                  <ListRow key={h.id} isLast={i === month.rows.length - 1}>
                    <View className="flex-1">
                      <Text className="font-body-semibold text-sm text-ink">
                        {h.bill_items?.label ?? category!.name}
                      </Text>
                      <Text className="mt-[2px] font-body text-xs text-ink-muted">
                        {memberName(h.checked_by)} ·{' '}
                        {new Date(h.checked_at ?? `${h.payday_date}T00:00:00`).toLocaleDateString(
                          undefined,
                          { month: 'short', day: 'numeric' },
                        )}
                      </Text>
                    </View>
                    <Text
                      className={`font-mono text-sm ${
                        category!.kind === 'bill' ? 'text-status-bad' : 'text-status-good'
                      }`}
                    >
                      {category!.kind === 'bill' ? '−' : '+'}
                      {formatPeso(h.amount)}
                    </Text>
                  </ListRow>
                ))}
              </Card>
            ))}
            {months.length === 0 && (
              <Card>
                <Text className="p-4 font-body text-sm text-ink-muted">Nothing checked off yet.</Text>
              </Card>
            )}
          </View>
        </View>

        <Button
          variant="secondary"
          className="border-status-bad"
          loading={deleteCategory.isPending}
          onPress={() => setConfirmingDelete(true)}
        >
          Delete category
        </Button>
      </KeyboardScroll>

      <DeleteCategorySheet
        visible={confirmingDelete}
        categoryName={category.name}
        categoryColor={category.color}
        showBillCount={category.kind === 'bill'}
        billCount={(billItems ?? []).length}
        entryCount={(history ?? []).length}
        totalLogged={balance}
        deleting={deleteCategory.isPending}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={handleConfirmDelete}
      />
    </SafeAreaView>
  );
}
