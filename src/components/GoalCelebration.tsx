import { useEffect, useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DoneBadge } from '@/components/ui/DoneBadge';
import type { Category } from '@/lib/database.types';
import { formatPeso } from '@/lib/format';
import {
  useCategories,
  useCategoryBalances,
  useHouseholdMembers,
  useMarkGoalCelebrated,
} from '@/lib/queries';

// A fund category "crosses" its goal threshold the first time its checked
// balance reaches target_amount while goal_celebrated_at is still unset -
// once useMarkGoalCelebrated claims it, this stops matching that category
// forever, which is what makes the celebration fire once instead of on
// every render/app-open that happens to be at/above target.
export function findGoalToCelebrate(
  categories: Category[] | undefined,
  balances: Record<string, number> | undefined,
): Category | null {
  if (!categories || !balances) return null;
  return (
    categories.find(
      (c) =>
        c.kind === 'fund' &&
        c.rule?.type === 'goal' &&
        !c.goal_celebrated_at &&
        (balances[c.id] ?? 0) >= c.rule.target_amount,
    ) ?? null
  );
}

// Mounted once above the tab navigator (app/(app)/_layout.tsx) so it catches
// a goal completion regardless of which screen actually pushed the balance
// over the line (checklist check-off or a manual contribution on the
// category detail screen both just update ledger_entries, which both
// useCategories/useCategoryBalances already react to).
export function GoalCelebration({ householdId }: { householdId: string | undefined }) {
  const { data: categories } = useCategories(householdId);
  const { data: balances } = useCategoryBalances(householdId);
  const { data: members } = useHouseholdMembers(householdId);
  const markCelebrated = useMarkGoalCelebrated(householdId);

  const goal = findGoalToCelebrate(categories, balances);
  const [shown, setShown] = useState<Category | null>(null);
  const claimed = useRef(new Set<string>());

  useEffect(() => {
    if (!goal || claimed.current.has(goal.id)) return;
    claimed.current.add(goal.id);
    markCelebrated.mutate(goal.id, {
      onSuccess: (row) => {
        if (row) setShown(goal);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.id]);

  if (!shown) return null;
  const target = shown.rule?.type === 'goal' ? shown.rule.target_amount : 0;
  const names = (members ?? []).map((m) => m.display_name).join(' & ') || 'You';

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => setShown(null)}>
      <View className="flex-1 items-center justify-center px-9" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Animated.View entering={ZoomIn.duration(260)} className="w-full">
          <Card className="items-center gap-3 p-8">
            <DoneBadge />
            <Text className="mt-1 text-center font-display text-lg text-ink">Goal complete!</Text>
            <Text className="text-center font-body text-base text-ink-2">
              {names} just reached {shown.name}, {formatPeso(target)}.
            </Text>
            <Button className="mt-4 w-full" onPress={() => setShown(null)}>
              Nice!
            </Button>
          </Card>
        </Animated.View>
      </View>
    </Modal>
  );
}
