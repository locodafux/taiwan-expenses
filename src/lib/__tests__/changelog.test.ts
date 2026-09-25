import { CHANGELOG, unseenEntries, type ChangelogEntry } from '../changelog';

const log: ChangelogEntry[] = [
  { id: 'c', date: 'Sep 24', items: ['newest'] },
  { id: 'b', date: 'Sep 21', items: ['middle'] },
  { id: 'a', date: 'Sep 18', items: ['oldest'] },
];

describe('unseenEntries', () => {
  it('shows only the latest entry when nothing has been seen yet', () => {
    expect(unseenEntries(log, null).map((e) => e.id)).toEqual(['c']);
  });

  it('shows nothing once the newest entry has been seen', () => {
    expect(unseenEntries(log, 'c')).toEqual([]);
  });

  it('shows every entry newer than the last one seen, newest first', () => {
    expect(unseenEntries(log, 'a').map((e) => e.id)).toEqual(['c', 'b']);
  });

  it('falls back to the latest entry when the seen id is no longer listed', () => {
    expect(unseenEntries(log, 'gone').map((e) => e.id)).toEqual(['c']);
  });
});

it('gives every changelog entry a unique id and at least one line', () => {
  expect(new Set(CHANGELOG.map((e) => e.id)).size).toBe(CHANGELOG.length);
  for (const entry of CHANGELOG) expect(entry.items.length).toBeGreaterThan(0);
});
