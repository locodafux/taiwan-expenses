import { waitFor } from '@testing-library/react-native';

import { renderWithTheme } from '@/test/renderWithTheme';

const mockUseCategories = jest.fn();
const mockUseCategoryBalances = jest.fn();
const mockUseHouseholdMembers = jest.fn();
const mockUseMarkGoalCelebrated = jest.fn();

jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useCategories: (...args: unknown[]) => mockUseCategories(...args),
  useCategoryBalances: (...args: unknown[]) => mockUseCategoryBalances(...args),
  useHouseholdMembers: (...args: unknown[]) => mockUseHouseholdMembers(...args),
  useMarkGoalCelebrated: (...args: unknown[]) => mockUseMarkGoalCelebrated(...args),
}));

import type { Category } from '@/lib/database.types';

import { findGoalToCelebrate, GoalCelebration } from '../GoalCelebration';

const members = [
  { id: 'm1', user_id: 'u1', display_name: 'Leo' },
  { id: 'm2', user_id: 'u2', display_name: 'Alex' },
];
const goalCategory: Category = {
  id: 'cat-fund',
  household_id: 'household-1',
  name: 'Taiwan fund',
  kind: 'fund',
  color: '#1f5c56',
  sort_order: 0,
  rule: { type: 'goal', target_amount: 150000 },
  archived: false,
  goal_celebrated_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

describe('findGoalToCelebrate (pure trigger logic)', () => {
  it('matches a fund/goal category once its balance reaches target', () => {
    expect(findGoalToCelebrate([goalCategory], { 'cat-fund': 150000 })).toEqual(goalCategory);
  });

  it('does not match while the balance is still below target', () => {
    expect(findGoalToCelebrate([goalCategory], { 'cat-fund': 149999 })).toBeNull();
  });

  it('does not match a goal that has already been celebrated', () => {
    const celebrated = { ...goalCategory, goal_celebrated_at: '2026-09-01T00:00:00Z' };
    expect(findGoalToCelebrate([celebrated], { 'cat-fund': 150000 })).toBeNull();
  });

  it('never matches a goal with no positive target (a new ₱0 fund has not reached anything)', () => {
    const zero = { ...goalCategory, rule: { type: 'goal' as const, target_amount: 0 } };
    expect(findGoalToCelebrate([zero], {})).toBeNull();
  });

  it('ignores bill categories and non-goal fund rules', () => {
    const bill: Category = { ...goalCategory, id: 'cat-bill', kind: 'bill', rule: null };
    const capped: Category = {
      ...goalCategory,
      id: 'cat-capped',
      rule: { type: 'capped_percent', percent: 30, cap: 100000 },
    };
    expect(
      findGoalToCelebrate([bill, capped], { 'cat-bill': 999999, 'cat-capped': 999999 }),
    ).toBeNull();
  });
});

describe('GoalCelebration', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseHouseholdMembers.mockReturnValue({ data: members });
    mockUseMarkGoalCelebrated.mockReturnValue({ mutate, isPending: false });
  });

  it('claims and shows the celebration exactly once when a fund goal crosses its target', async () => {
    mockUseCategories.mockReturnValue({ data: [goalCategory] });
    mockUseCategoryBalances.mockReturnValue({ data: { 'cat-fund': 150000 } });
    mutate.mockImplementation((id, { onSuccess }) => onSuccess({ id, goal_celebrated_at: 'now' }));

    const { getByText } = await renderWithTheme(<GoalCelebration householdId="household-1" />);

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith('cat-fund', expect.any(Object));
    await waitFor(() => expect(getByText(/Leo & Alex/)).toBeTruthy());
    expect(getByText(/Taiwan fund/)).toBeTruthy();
    expect(getByText(/₱\s?150,000/)).toBeTruthy();
  });

  it('does not fire while the balance is still below target', async () => {
    mockUseCategories.mockReturnValue({ data: [goalCategory] });
    mockUseCategoryBalances.mockReturnValue({ data: { 'cat-fund': 120000 } });

    const { queryByText } = await renderWithTheme(<GoalCelebration householdId="household-1" />);

    expect(mutate).not.toHaveBeenCalled();
    expect(queryByText('Goal complete!')).toBeNull();
  });

  it('does not refire once the goal has already been celebrated', async () => {
    mockUseCategories.mockReturnValue({
      data: [{ ...goalCategory, goal_celebrated_at: '2026-09-01T00:00:00Z' }],
    });
    mockUseCategoryBalances.mockReturnValue({ data: { 'cat-fund': 150000 } });

    const { queryByText } = await renderWithTheme(<GoalCelebration householdId="household-1" />);

    expect(mutate).not.toHaveBeenCalled();
    expect(queryByText('Goal complete!')).toBeNull();
  });

  it('does not show the celebration if another device already claimed it first', async () => {
    mockUseCategories.mockReturnValue({ data: [goalCategory] });
    mockUseCategoryBalances.mockReturnValue({ data: { 'cat-fund': 150000 } });
    mutate.mockImplementation((id, { onSuccess }) => onSuccess(null));

    const { queryByText } = await renderWithTheme(<GoalCelebration householdId="household-1" />);

    expect(mutate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(queryByText('Goal complete!')).toBeNull());
  });
});
