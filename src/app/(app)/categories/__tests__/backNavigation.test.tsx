import { Stack, Tabs, usePathname, useRouter } from 'expo-router';
import { act, fireEvent, renderRouter } from 'expo-router/testing-library';
import { BackHandler, Pressable, Text } from 'react-native';

import { ThemeProvider } from '@/theme/ThemeProvider';

// Regression: the category detail's back used router.back(), which from a
// detail opened on another tab (Dashboard, Checklist) or via a deep link fell
// through to the tab history and landed on the Dashboard, not the list.
const mockCategory = { id: 'c1', name: 'Rent', kind: 'fund', color: '#c1552f', rule: null };
const mockMutation = { mutateAsync: jest.fn(), isPending: false };
jest.mock('@/lib/queries', () => ({
  ...jest.requireActual('@/lib/queries'),
  useHouseholdMembership: () => ({ data: { id: 'm1', household_id: 'h1', user_id: 'u1' } }),
  useCategories: () => ({ data: [mockCategory] }),
  useCategoryHistory: () => ({ data: [] }),
  useHouseholdMembers: () => ({ data: [] }),
  useBillItems: () => ({ data: [] }),
  useAddManualContribution: () => mockMutation,
  useCreateBillItem: () => mockMutation,
  useDeleteCategory: () => mockMutation,
  useUpdateCategory: () => mockMutation,
  useUpdateBillItem: () => mockMutation,
  useDeleteBillItem: () => mockMutation,
}));

import CategoryDetail from '../[id]';

function Opener({ label }: { label: string }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push('/(app)/categories/c1')}>
      <Text>{label}</Text>
    </Pressable>
  );
}

function AppTabs() {
  return (
    <>
      <Text testID="path">{usePathname()}</Text>
      <Tabs screenOptions={{ headerShown: false }} />
    </>
  );
}

// Mirrors src/app/(app)/_layout.tsx (Tabs) + categories/_layout.tsx (Stack).
const tree = {
  '_layout': () => <Stack screenOptions={{ headerShown: false }} />,
  '(app)/_layout': AppTabs,
  '(app)/index': () => <Opener label="open from dashboard" />,
  '(app)/checklist': () => <Opener label="open from checklist" />,
  '(app)/categories/_layout': () => <Stack initialRouteName="index" screenOptions={{ headerShown: false }} />,
  '(app)/categories/index': () => <Opener label="open from list" />,
  '(app)/categories/[id]': CategoryDetail,
};

async function openDetail(from: 'dashboard' | 'checklist' | 'list') {
  const url = { dashboard: '/', checklist: '/checklist', list: '/categories' }[from];
  const r = await renderRouter(tree, { initialUrl: url, wrapper: ThemeProvider });
  await fireEvent.press(r.getByText(`open from ${from}`));
  expect(r.getByTestId('path').props.children).toBe('/categories/c1');
  return r;
}

describe.each(['dashboard', 'checklist', 'list'] as const)('category detail opened from the %s', (from) => {
  it('the Back button lands on the categories list', async () => {
    const r = await openDetail(from);
    await fireEvent.press(r.getByText('‹ Back'));
    expect(r.getByTestId('path').props.children).toBe('/categories');
  });

  it('Android hardware back lands on the categories list', async () => {
    const add = jest.spyOn(BackHandler, 'addEventListener');
    const r = await openDetail(from);
    const handler = add.mock.calls.at(-1)![1];
    let handled = false;
    await act(() => {
      handled = handler({} as never) === true;
    });
    expect(handled).toBe(true);
    expect(r.getByTestId('path').props.children).toBe('/categories');
    add.mockRestore();
  });
});

it('the Back button lands on the categories list when the detail was deep-linked', async () => {
  const r = await renderRouter(tree, { initialUrl: '/categories/c1', wrapper: ThemeProvider });
  await fireEvent.press(r.getByText('‹ Back'));
  expect(r.getByTestId('path').props.children).toBe('/categories');
});
