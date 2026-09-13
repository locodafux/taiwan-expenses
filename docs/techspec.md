# Technical Spec: taiwan-expenses (React Native/Expo + Supabase rebuild)

**Scope:** technical feasibility/spec only — stack, versions, libraries, setup. Product/UX (data model, categories, allocation logic, look-and-feel) is owned by the sibling `taiwan-expenses-plan` task; this report flags where a tech choice has product implications for that task or the captain to weigh in on, but doesn't decide them.

**Checked:** 2026-09-13, via live `npm view` against the npm registry, WebSearch, and WebFetch against official docs (docs.expo.dev, supabase.com, developer.android.com). No project was scaffolded and no Supabase project was created — this worktree only ran read-only research commands (see Evidence Log at bottom).

**Household context assumed:** 2 named users (captain + Ann), both on personal Android phones, shared single household of financial data, low write volume (expense entries, budget categories), no production data pressure yet.

---

## TL;DR recommendation

| Layer | Pick | Version (checked 2026-09-13) |
|---|---|---|
| Scaffold | `create-expo-app` default template (TS + Expo Router) | Expo SDK **57** (`expo@57.0.22`) |
| Navigation | Expo Router (built on React Navigation) | `expo-router@57.0.21` / `@react-navigation/native@7.3.18` |
| Styling | NativeWind (Tailwind) + gluestack-ui v2 | `nativewind@4.2.6`, `tailwindcss@4.3.3` |
| Data/Auth backend | Supabase (cloud free-tier project, not local Docker) | `@supabase/supabase-js@2.116.0` |
| Session storage | `@react-native-async-storage/async-storage` (per official Supabase pattern) | `@react-native-async-storage/async-storage@3.1.1` |
| Server-state caching | TanStack Query on top of supabase-js, plain refetch (no Realtime) | `@tanstack/react-query@5.102.8` |
| Dev-time install | Expo Go (Play Store or `expo.dev/go` direct link) | — |
| Permanent install | EAS Build, `internal` distribution profile, Android APK via QR | free tier: 15 builds/mo |

Everything below is well inside Supabase's free tier for 2 users. The one real external risk is **Android's new Developer Verification rollout** (see §8) — it doesn't block this app today, but it changes what "install a permanent APK" means starting in 2027.

---

## 1. React Native / Expo setup

- **Current SDK:** Expo SDK **57** (`expo` npm `dist-tag latest` = `57.0.22`, confirmed via `npm view expo version`). SDK 57 pairs with **React Native 0.86** and React 19.2.3 (confirmed via `docs.expo.dev/versions/latest/`). Requires **Node.js ≥ 22.13.x**.
- **Scaffold command:**
  ```
  npx create-expo-app@latest taiwan-expenses
  ```
  The default template as of SDK 57 already ships **TypeScript + Expo Router** — there's no separate "TS template" flag to remember anymore; `--template blank-typescript` exists only if you explicitly want to opt *out* of Expo Router's file-based navigation.
- Don't hand-install `react-native` yourself — the bare npm "latest" tag for `react-native` (`0.87.1`) is *ahead* of what Expo 57 expects (`0.86`). Expo's tooling (`npx expo install`) pins compatible versions; use that instead of plain `npm install` for any Expo/RN-adjacent package.
- **Expo Go is sufficient for this app.** Nothing in a budgeting/expense-tracking app (forms, lists, charts, Supabase over HTTPS) needs a custom native module or config-plugin change to `AndroidManifest.xml`/`Info.plist`, which are the only things that force a move to a custom **development build** (`expo-dev-client`). Recommendation: don't add `expo-dev-client` unless a later feature (e.g. push notifications with custom entitlements, biometric unlock) needs it.

## 2. Supabase free tier — confirmed comfortably sufficient

Source: `supabase.com/pricing` (fetched directly), cross-checked against several 2026 pricing summaries.

| Limit | Free tier | This app's expected usage |
|---|---|---|
| Database size | 500 MB (shared CPU, 500 MB RAM) | Years of two people's expense rows is low tens of MB — no risk |
| Monthly active users (auth) | 50,000 MAU | 2 users |
| File storage | 1 GB | Only relevant if receipt photos are added later; still ample |
| Egress (DB) | 5 GB/mo | 2 users polling a small dataset — trivially under |
| Cached egress | 5 GB/mo | n/a at this scale |
| Active projects | 2 max | 1 project needed (dev can reuse the same project — see §7) |
| Inactivity pause | Paused after 1 week idle | **Real gotcha, see §8** |
| Backups / PITR | None on Free | Worth noting for the captain: no safety net if someone runs a bad `DELETE` |

**Verdict:** this app sits nowhere near any Free tier ceiling. The only tier characteristic that actually matters operationally is the **1-week inactivity pause**, not size or MAU.

## 3. Supabase + React Native integration

- **Client library:** `@supabase/supabase-js` (current `2.116.0`) — there is no separate "React Native SDK"; the JS client is used directly, with a storage adapter swapped in.
- **Official session-persistence pattern** (`supabase.com/docs/guides/auth/quickstarts/react-native`):
  ```ts
  import { createClient } from '@supabase/supabase-js'
  import AsyncStorage from '@react-native-async-storage/async-storage'

  export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // no URL to read a session from on native
    },
  })
  ```
- **AsyncStorage vs `expo-secure-store`:** Supabase's own docs recommend AsyncStorage for this exact use case. `expo-secure-store` is backed by iOS Keychain, which has a practical ~2 KB item-size limit — smaller than a Supabase session (JWT + refresh token), so it can't hold the session directly without a custom encrypt-then-store-key-in-SecureStore workaround. For a household expense app (not health/payment-credential data), plain AsyncStorage is the documented, lower-effort choice. If the captain wants belt-and-suspenders later, the upgrade path is: encrypt the session blob, store the encryption key in SecureStore, store ciphertext in AsyncStorage — not needed to start.
- **Realtime vs refetch:** Supabase Realtime (Postgres change subscriptions) is not worth it here. It adds non-trivial code (per-row `applyChange` reducers, `useEffect` subscription cleanup to avoid leaking listeners, careful handling to avoid O(n²) re-renders on bulk changes) for a 2-user app where "Ann adds an expense and I see it a few seconds later" is fine. **Recommendation: TanStack Query with `refetchOnWindowFocus`/a short `staleTime`, no Realtime channel.** This is a place the sibling plan/captain may want a say: if "see your partner's entry appear live while both are looking at the screen together" is an explicit desired feel, Realtime is easy to bolt on later (it's additive, not a rearchitecture).

## 4. Auth / RLS pattern — two auth users, one shared household row

Source: `supabase.com/docs/guides/database/postgres/row-level-security` (official pattern for team/shared-row access, fetched directly).

The naive approach (a policy on `households` that checks a join back to `household_members`, and a policy on `household_members` that checks back to `households`) causes Postgres error `42P17: infinite recursion detected in policy`. The documented fix is a `SECURITY DEFINER` helper function that reads membership *without* re-triggering RLS:

```sql
create schema if not exists private;

create function private.user_household_ids()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select household_id from public.household_members
  where user_id = (select auth.uid())
$$;

grant usage on schema private to authenticated;
grant execute on function private.user_household_ids() to authenticated;

-- households: members can read/update the household(s) they belong to
create policy "members read households" on households
  for select to authenticated
  using ( id in (select private.user_household_ids()) );

create policy "members update households" on households
  for update to authenticated
  using ( id in (select private.user_household_ids()) )
  with check ( id in (select private.user_household_ids()) );

-- household_members: a user can only insert their own membership row
create policy "members join households" on household_members
  for insert to authenticated
  with check ( user_id = (select auth.uid()) );
```

**Shape this implies (concrete recommendation for the data model, flagged for the sibling plan task):** an `auth.users` row per person (captain, Ann) → a `household_members(user_id, household_id)` join table → every expense/budget/category table carries `household_id` and reuses the same `household_id in (select private.user_household_ids())` policy for select/insert/update/delete. This is the standard "shared workspace" RLS shape and is the one to build on rather than inventing something bespoke.

## 5. Recommended libraries

- **Navigation:** use **Expo Router** (`expo-router@57.0.21`, ships in the default template), not bare React Navigation — it *is* React Navigation (`@react-navigation/native@7.3.18` underneath) with file-based routing and less boilerplate for a small number of screens (dashboard, add-expense, budget, settings).
- **Styling / "pretty, fun, couple-themed" fast:** **NativeWind v4** (`nativewind@4.2.6`, on Tailwind core `4.3.3`) + **gluestack-ui v2** as the component layer. gluestack-ui v2 (current major, `v1` is in limited-time maintenance only) rebuilt itself on top of NativeWind specifically so components take Tailwind classes — meaning a custom color palette/fonts for a "couple" theme is a Tailwind config change, not fighting a Material Design system. This beats **React Native Paper** (`5.15.3`, Material Design look — harder to make feel "fun"/custom) and **Tamagui** (`2.7.7`, powerful but has a compiler-setup learning curve that's overkill for a 2-screen-ish household app).
- **Data-fetching/caching:** **TanStack Query** (`@tanstack/react-query@5.102.8`) wrapping `supabase-js` calls, rather than calling the Supabase client ad hoc in components. Gives caching, refetch-on-focus, and optimistic updates for near-free, which matters more than usual here since two people editing the same budget will otherwise see stale data without manual refresh logic.

## 6. Android installability specifics

- **During development:** install **Expo Go** from the Google Play Store on both phones, then `npx expo start` and scan the QR code. No Expo/EAS account is required for this. One current wrinkle: Expo Go's Play Store build lags a few days behind a new SDK release (SDK 57's Android Play Store build was still catching up as of early September 2026 per Expo's own changelog threads); if the Play Store version is stale, `expo.dev/go?sdkVersion=57&platform=android&device=true` gives a direct APK/link for the exact SDK-57 Expo Go build, sidestepping the Play Store review lag.
- **For a "permanent" install (not tethered to a dev server):** you need an **EAS Build** with `"distribution": "internal"` in `eas.json`, e.g.:
  ```
  eas build --platform android --profile preview
  ```
  This produces a real, installable **APK**, and EAS gives you a QR code / link to install it directly on a phone (open the link on the phone, or scan from the build page) — no Play Store listing needed. This does require a free **Expo/EAS account** (`eas login`).
- **Free-tier EAS Build limits** (`expo.dev/pricing`, fetched directly): **15 Android + 15 iOS builds/month, 1 build at a time (concurrency), low queue priority.** For 2 people building occasionally during development, this is not a constraint — it would only bite if you're iterating on native config many times a day.
- **Gotchas:**
  - Installing an APK not from the Play Store requires the phone owner to grant "install unknown apps" permission to whichever app opens it (browser/Files) — no single global toggle since Android 8.
  - Google Play Protect will still scan and may show a warning dialog even for a legitimate personal APK; this is expected and safe to dismiss for a build you produced yourself, but is worth flagging to the captain and Ann ahead of time so it isn't mistaken for a real problem.
  - No code signing setup is required for internal-distribution APKs — EAS handles a build keystore automatically; this only becomes a concern if the app is ever submitted to the Play Store, which is out of scope here.

## 7. Local dev workflow: real free-tier Supabase project vs local CLI/Docker

**Recommendation: use one real free-tier Supabase cloud project directly**, not the local CLI/Docker stack, for this app.

Reasoning:
- The local stack (`supabase init && supabase start`) spins up Postgres, GoTrue, Storage, and Realtime in Docker and is genuinely useful for teams doing offline work or heavy schema-migration iteration — but it also wants **~7 GB of RAM** for the full stack and is one more moving part to keep updated.
- This is a 2-person household app with no offline-development requirement and no CI pipeline running migrations yet; a shared cloud dev project avoids all of that overhead, is genuinely free at this scale (§2), and means the captain and Ann are testing against the exact same environment (including RLS behavior with real `auth.uid()`s) rather than a local approximation.
- The Supabase CLI is still worth installing for one purpose regardless of where Postgres runs: `supabase migration new` / `supabase db push` to keep schema changes as versioned SQL files rather than hand-edited via the dashboard — this matters once the sibling plan's data model is finalized and a future ship task needs to apply it.

**One real gotcha this creates (see §8):** a Free-tier project **pauses after 7 days of no activity** — since this is dev-stage with no production data yet, an idle week during planning would pause the project and require an unpause click in the dashboard before the next dev session. Not a blocker, just something to expect.

## 8. Blockers / what could go wrong

1. **Supabase free-project auto-pause (real, minor).** If nobody touches the project for 7 days (plausible while the sibling UX plan is still being worked out), it pauses. Unpausing is a one-click dashboard action, not data loss, but if a "come back in two weeks and demo it" moment happens, budget 2 minutes to unpause first.
2. **No backups on Free tier.** If the shared household table ever gets a bad manual `UPDATE`/`DELETE` (e.g. via the SQL editor), there is no PITR/backup to restore from on Free. Worth a lightweight mitigation later (e.g. a soft-delete column) — a product decision for the sibling task, flagged here because it's a consequence of the free-tier choice.
3. **Android Developer Verification (new, timing matters, not a current blocker).** Google is rolling out a requirement (confirmed via `developer.android.com/developer-verification`) that apps installed on "certified" Android devices (i.e., any mainstream phone with Google Play Services — which the captain's and Ann's phones almost certainly are) come from an identity-verified developer, **including sideloaded APKs**, not just Play Store apps. Enforcement starts 2026-09-30 in Brazil/Indonesia/Singapore/Thailand only, expanding globally through 2027. Two things make this a non-issue for now and an easy issue later:
   - It doesn't affect **Expo Go** at all (that's an already-verified, Play-Store-distributed app).
   - For the **EAS-built APK**, Google is shipping a free "limited distribution" developer account for students/hobbyists — no government ID, no fee, install on **up to 20 devices** — which comfortably covers a 2-phone household app. There's also a documented "Advanced Flow" and ADB-based path intended to stay open for developers installing their own unverified apps.
   - **Action needed, not now:** if a future ship task builds and hands over an installable APK sometime in 2027+, register the captain's Expo/EAS account under this free hobbyist track before that APK stops installing on Android without it. Nothing to do today — flagging so it isn't a surprise later.
4. **Expo Go Android build lag behind new SDKs.** Minor, workaround already given in §6 (`expo.dev/go` direct link). Only matters right after a new SDK ships.
5. **Nothing found that blocks the "two logins, one shared row" pattern.** The RLS shape in §4 is a standard, documented Supabase pattern, not a workaround — this is not an auth-model risk.

## Open questions for the sibling plan task / captain (not decided here)

- Whether "live" partner updates (Realtime) are a wanted *feel*, even though refetch-based caching is the simpler default (§3).
- Whether receipt-photo storage (Supabase Storage) is actually in scope — if so, still trivially within the 1 GB free tier, just confirming it's wanted before wiring it up.
- Soft-delete / undo affordance in the data model, given Free tier has no backups (§8.2).

---

## Evidence log

Commands actually run in this worktree (read-only; nothing installed into the repo, no Supabase project created, no app scaffolded):

```
node --version && npm --version
# v26.7.0 / 11.19.0

npm view expo version                                  # 57.0.22
npm view react-native version                           # 0.87.1 (bare RN "latest" — Expo pins its own compatible RN version, see §1)
npm view @supabase/supabase-js version                  # 2.116.0
npm view @react-native-async-storage/async-storage version  # 3.1.1
npm view expo-secure-store version                       # 57.0.4
npm view nativewind version                               # 4.2.6
npm view tailwindcss version                              # 4.3.3
npm view react-native-paper version                       # 5.15.3
npm view tamagui version                                  # 2.7.7
npm view @gluestack-ui/themed version                      # 1.1.73 (legacy v1 package name; v2 restructured to copy-paste components, see §5)
npm view @tanstack/react-query version                     # 5.102.8
npm view @react-navigation/native version                  # 7.3.18
npm view @react-navigation/native-stack version            # 7.18.10
npm view expo-router version                               # 57.0.21
```

Plus WebFetch against `docs.expo.dev/build-reference/limitations/`, `docs.expo.dev/versions/latest/`, `expo.dev/pricing`, `supabase.com/pricing`, `supabase.com/docs/guides/database/postgres/row-level-security`, and `developer.android.com/developer-verification`, and WebSearch for cross-checks, all on 2026-09-13.
