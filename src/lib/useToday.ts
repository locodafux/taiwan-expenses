import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { appToday, toDateOnly } from './payday';

// Today's date ('YYYY-MM-DD', via appToday) that updates itself: at local
// midnight while the app stays open, and on return to the foreground (a
// backgrounded app's timers don't fire). Screens that derive "the next payday"
// depend on it so a payday that has passed rolls to the next one without a restart.
export function useToday(): string {
  const [today, setToday] = useState(() => toDateOnly(appToday()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      setToday(toDateOnly(appToday()));
      clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 1000);
    };
    refresh();
    const sub = AppState.addEventListener('change', (status) => status === 'active' && refresh());
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return today;
}
