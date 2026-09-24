// What changed in each released build, newest first, written for the couple
// using the app. Every user-visible change adds a line to the top entry (or a
// new entry for a new build), and the GitHub release body mirrors the newest
// entry under a "## What's new" heading - see AGENTS.md.
export type ChangelogEntry = {
  // Unique and never reused: it's what each phone remembers as "seen".
  id: string;
  date: string;
  items: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-09-24',
    date: 'Sep 24, 2026',
    items: [
      'After each update, this list shows what changed. You can open it again anytime from Settings → What’s new.',
      'The update prompt now lists what’s in the new version before you download it.',
      'Every payday’s checklist now adds up to exactly that day’s pay. If a payday can’t cover its own bills, an earlier payday sets money aside for it, and the checklist says so.',
      'Typing a goal target with commas, like 80,000, now saves the right amount. Before, it saved ₱0 and instantly said “Goal complete!”.',
      'The “left over” card is gone from the Checklist. To put extra money in a fund, open the category and tap “+ Add contribution”.',
      'Income moved out of the tab bar. Find it in Settings, under Your profile.',
      'Delete account is tucked away in Settings under “Danger zone”, so it isn’t in view every time.',
    ],
  },
  {
    id: '2026-09-21',
    date: 'Sep 21, 2026',
    items: [
      'A fresh new look: warmer colours, new fonts and simple line icons.',
      'Edit a category or a bill after adding it, and delete bills you no longer pay. Past payments stay in the history.',
      'Bills and loans can have an end: pick the last month you pay, and the app shows how many payments are left.',
      'Goals can have a “complete by” month, and the app spreads the saving over the months before it.',
      'One-time goals get funded first, from the earliest month that can cover them. If a goal can’t be reached in time, the Checklist tells you how much is missing.',
      'Notifications for bills due tomorrow, payday checklists, and when your partner pays a bill or adds something. Turn them off in Settings.',
      'In Chat, delete your own messages or clear the history on your phone. Your partner’s chat stays as it is.',
      'Back from a category now always returns to the Categories list.',
    ],
  },
];

// Entries newer than the one this phone last saw. With nothing seen yet (a
// fresh install, or the first build that had this list) or an id that's no
// longer listed, just the latest - not the whole history.
export function unseenEntries(log: ChangelogEntry[], seenId: string | null): ChangelogEntry[] {
  const i = log.findIndex((e) => e.id === seenId);
  return i === -1 ? log.slice(0, 1) : log.slice(0, i);
}
