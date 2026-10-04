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
    id: '2026-10-04-cashflow-landscape',
    date: 'Oct 4, 2026',
    items: [
      'Yearly Cashflow has a new "See every column at once" button. It turns your phone sideways and shows Income, Expenses, Debt, Money staying and every fund on one screen with smaller text, so there is no swiping. Go back and the app turns upright again.',
    ],
  },
  {
    id: '2026-10-04-cashflow-earlier-back',
    date: 'Oct 4, 2026',
    items: [
      'The earlier Yearly Cashflow is back: full amounts and full column names again, with the Total row. Swipe sideways to see every column.',
    ],
  },
  {
    id: '2026-10-04-fund-planner-name-icon',
    date: 'Oct 4, 2026',
    items: [
      'The app is now called Fund Planner, with a new piggy bank icon on a soft pink background.',
    ],
  },
  {
    id: '2026-10-04-checklist-checkbox-total',
    date: 'Oct 4, 2026',
    items: [
      'The Checklist checkboxes are back: tap the box beside a bill or fund to tick it off, and it moves below the unticked ones.',
      'Each payday now shows a Total at the bottom of the list, with how much of it you have ticked off.',
    ],
  },
  {
    id: '2026-10-04-cashflow-fits-screen',
    date: 'Oct 4, 2026',
    items: [
      'Yearly Cashflow now fits your screen: every column shows at once with no swiping sideways. Amounts are short (11.8k, 240k) and each column has a colour dot and a few letters.',
      'Tap any month, or the Total row, in Yearly Cashflow to see the full amounts under the table.',
    ],
  },
  {
    id: '2026-10-04-complete-by-month-counts',
    date: 'Oct 4, 2026',
    items: [
      'The Checklist no longer says a fund will be short by its deadline when the money arrives during its "Complete by" month (Pinatubo and TAIWAN FUND were wrongly flagged).',
      'Ticking off paydays no longer changes the short-by warning or the Yearly Cashflow amounts for the next month.',
    ],
  },
  {
    id: '2026-10-04-cashflow-year-view',
    date: 'Oct 4, 2026',
    items: [
      'Yearly Cashflow now shows one year at a time, starting with this year (Oct to Dec 2026). Use the arrows to see the next years.',
      'Yearly Cashflow lines up better: wider columns, headers that wrap instead of getting cut off, and a Total row for the year shown.',
    ],
  },
  {
    id: '2026-10-04-money-staying-36-months',
    date: 'Oct 4, 2026',
    items: [
      'Yearly Cashflow has a new Money staying column right after Debt: all your fund columns added up, so you can see what is left each month without swiping.',
      'Yearly Cashflow now runs three years, Oct 2026 to Sep 2029. Months beyond your next payday assume today\'s income, bills and rules.',
    ],
  },
  {
    id: '2026-10-04-excess-graph-removed',
    date: 'Oct 4, 2026',
    items: ['The Excess graph in the Fund summary on the Dashboard is gone.'],
  },
  {
    id: '2026-10-04-excess-graph',
    date: 'Oct 4, 2026',
    items: [
      'The Fund summary on the Dashboard now has a graph for Excess: one bar per month showing how much stays in Excess.',
      'The graph on Yearly Cashflow is gone; the table stays.',
    ],
  },
  {
    id: '2026-10-04-yearly-cashflow',
    date: 'Oct 4, 2026',
    items: [
      'The Full numbers table on the Dashboard is now called Yearly Cashflow, and it has a graph on top: one bar per month for your income and one for where it goes.',
      'Yearly Cashflow is easier to read: the current month is highlighted, amounts drop the repeated ₱ sign and show a dash for zero, and each column header carries its graph color.',
    ],
  },
  {
    id: '2026-10-04-dashboard-full-numbers',
    date: 'Oct 4, 2026',
    items: [
      'The Full numbers table now shows right on the Dashboard, under the category balances.',
      'The side menu is gone. Settings is now a tab in the bottom bar, next to Chat.',
    ],
  },
  {
    id: '2026-10-04-percent-until-complete-by',
    date: 'Oct 4, 2026',
    items: ['A fund\'s "Percentage by month" now stops at its Complete by month instead of listing a full year.'],
  },
  {
    id: '2026-10-04-no-last-month',
    date: 'Oct 4, 2026',
    items: [
      'Categories no longer have a Last month - a category just keeps going from its Starts month.',
      'Saving a percentage for one month inside a group now works when the other funds in the group are not running that month (for example Pinatubo in Oct-Nov and Taiwan Fund from Dec).',
      'Each month in a fund\'s "Percentage by month" now shows how much of the group is left, and a save that would go over 100% says so right there.',
    ],
  },
  {
    id: '2026-10-02-header-title',
    date: 'Oct 2, 2026',
    items: [
      'The top bar now shows the screen name next to the menu button, so there is no more empty strip beside it.',
    ],
  },
  {
    id: '2026-09-30-zero-percent-child',
    date: 'Sep 30, 2026',
    items: [
      'A category inside a group can now have 0% - it simply gets nothing until you raise it, and its share stays in the group.',
      'Each month of a category inside a group can have its own percentage: open the category and fill in the month you want to change (0 is fine). Blank months use the usual percentage.',
    ],
  },
  {
    id: '2026-09-30-dashboard-all-categories',
    date: 'Sep 30, 2026',
    items: [
      'The Dashboard shows every category again, even ones that start in a later month (they say "starts Nov 2026"), and the fund summary now includes every fund, like Pinatubo.',
    ],
  },
  {
    id: '2026-09-30-bottom-tabs',
    date: 'Sep 30, 2026',
    items: [
      'The bottom bar is back with Dashboard, Checklist, Categories and Chat (with the unread badge on Chat). Settings and Full numbers stay in the side menu.',
    ],
  },
  {
    id: '2026-09-30-menu-spacing',
    date: 'Sep 30, 2026',
    items: [
      'Removed the big empty gap under the menu button on every screen, and made "Category balances" on the Dashboard a proper big title.',
    ],
  },
  {
    id: '2026-09-30-full-numbers',
    date: 'Sep 30, 2026',
    items: [
      'New Full numbers screen in the side menu: one table with every month from Oct 2026 to Jul 2027 — income, expenses, debt and each fund — with a Total row at the bottom. Swipe sideways to see every column; the month names stay in place.',
    ],
  },
  {
    id: '2026-09-30-menu',
    date: 'Sep 30, 2026',
    items: [
      'The bottom tab bar is now a side menu: tap the menu button at the top-left of any screen to jump to Dashboard, Checklist, Categories, Chat or Settings. A dot on the button means unread chat messages.',
      'Your household name and email moved into the side menu; the Dashboard no longer repeats them at the top.',
    ],
  },
  {
    id: '2026-09-30-1',
    date: 'Sep 30, 2026',
    items: [
      'Every category now has a Starts month and an optional Last month, in Categories when you add or edit one. Outside those months it gets no money set aside and no bills.',
      'Existing categories start in October 2026 with no end, so nothing changes until you set a Last month.',
    ],
  },
  {
    id: '2026-09-29-6',
    date: 'Sep 29, 2026',
    items: [
      'The Dashboard’s Fund summary shows Taiwan Fund, Emergency Fund and Savings with what you’ve saved and a progress bar toward ₱80,000 for Taiwan.',
      'Emergency Fund and Savings show a progress bar and percent too, measured against what the payday plan puts in by March 2027 (marked “plan by March”).',
      'Removed “Saved this quarter” from the top of the Dashboard.',
    ],
  },
  {
    id: '2026-09-29-5',
    date: 'Sep 29, 2026',
    items: [
      'The Dashboard now has a Fund summary: a bar for Taiwan Fund, Emergency Fund and Savings showing what you’ve saved so far, with Taiwan’s progress toward ₱80,000.',
      'Removed the payday streak from the top of the Dashboard.',
      'Breakdown’s month table is now a chart: one bar per month, coloured by fund and category. Tap a month to see its amounts. The Total column is gone.',
    ],
  },
  {
    id: '2026-09-29-4',
    date: 'Sep 29, 2026',
    items: [
      'The Breakdown month table now shows each linked fund’s share (Taiwan, Emergency, Savings…) for every month instead of a dash, and the parent fund shows what is left after those shares.',
    ],
  },
  {
    id: '2026-09-29-3',
    date: 'Sep 29, 2026',
    items: [
      'The Payday calendar’s monthly summary now shows one Taiwan Fund total for the month, like Emergency and Savings, instead of two repeated numbers.',
    ],
  },
  {
    id: '2026-09-29-2',
    date: 'Sep 29, 2026',
    items: [
      'The app now starts in October 2026 everywhere — the dashboard’s next payday, the Breakdown months, history and month pickers never show anything earlier, even before October begins.',
    ],
  },
  {
    id: '2026-09-29',
    date: 'Sep 29, 2026',
    items: [
      'New Payday calendar on the Breakdown screen: October 2026 to March 2027 with every payday (5th, 15th, 20th, 30th) marked. Tap one to see what comes in, what gets paid, and how much goes to Taiwan, Emergency, Savings and what’s left — plus a monthly summary that adds up those paydays.',
      'The Payday calendar now has a soft pink look — dusty rose highlights for paydays and the Taiwan, Emergency and Savings sections.',
    ],
  },
  {
    id: '2026-09-28',
    date: 'Sep 28, 2026',
    items: [
      'Touched up the color palette across all three looks — text and category colors are richer and easier to read against their backgrounds.',
      'Reviewing an upcoming payday from the dashboard now shows that payday’s own checklist — what it’ll actually pay for — instead of always jumping to the next one. It’s a preview, so nothing on it can be checked off until that payday actually arrives.',
    ],
  },
  {
    id: '2026-09-27-3',
    date: 'Sep 27, 2026',
    items: [
      'New Settings → Summary of all: see where each fund is headed, not just where it is now — its projected total once its savings goal (or the household’s furthest one) is reached.',
    ],
  },
  {
    id: '2026-09-27-2',
    date: 'Sep 27, 2026',
    items: [
      'New Settings → Breakdown screen: a month-by-month table of every category, with real history behind today and a projection ahead of it.',
      'Capped funds now project correctly further into the future, instead of always checking their cap against today’s balance.',
    ],
  },
  {
    id: '2026-09-27',
    date: 'Sep 27, 2026',
    items: [
      'Groups of funds can now have their own savings goal, not just a fixed share — the app fits each fund’s goal into its slice of the group and keeps the rest in the parent fund.',
      'You can also group bills together just to keep them organized, with no money moving between them.',
      'Confirmation pop-ups, like deleting a bill or your account, now match the rest of the app instead of your phone’s plain system alert.',
    ],
  },
  {
    id: '2026-09-26-2',
    date: 'Sep 26, 2026',
    items: [
      'The Next payday card now has arrows so you can look back at your last payday or step forward to upcoming ones.',
    ],
  },
  {
    id: '2026-09-26',
    date: 'Sep 26, 2026',
    items: [
      'The Categories list now shows the current amount in each fund, so you can see your balances at a glance.',
      'You can group funds so linked funds receive a share of a parent fund’s payday allocation, while the rest stays in the parent fund.',
    ],
  },
  {
    id: '2026-09-24',
    date: 'Sep 24, 2026',
    items: [
      'After each update, this list shows what changed. You can open it again anytime from Settings → What’s new.',
      'The update prompt now lists what’s in the new version before you download it.',
      'Every payday’s checklist now adds up to exactly that day’s pay. If a payday can’t cover its own bills, an earlier payday sets money aside for it, and the checklist says so.',
      'Ticked items on the Checklist now move to the bottom of their group.',
      'New option in Settings: tick off past paydays automatically when a new cutoff starts.',
      'A fund without a goal can pick its share of the left-over money, and the Categories list shows how much each fund gets right now.',
      'Funds can no longer be skipped for a month. Any that were skipped are back to normal.',
      '“Report a bug” is now Settings → Feedback: report a problem or suggest an idea, and see whether it’s planned or done.',
      'You get a notification when your partner sends a chat message.',
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
