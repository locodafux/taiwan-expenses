import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';

import { DEFAULT_THEME, THEMES, type ThemeName, type ThemeVars } from './tokens';

const STORAGE_KEY = 'taiwan-fund-planner:theme';

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  // Resolved hex/rgba values for the active theme - use these (not the
  // "var(--x)" strings) in raw style props or third-party native components
  // (e.g. react-native-svg) that NativeWind's className interop doesn't
  // reach. className-based styling resolves var() correctly on its own.
  vars: ThemeVars;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in THEMES) setThemeState(stored as ThemeName);
    });
  }, []);

  function setTheme(next: ThemeName) {
    setThemeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }

  const value = useMemo(() => ({ theme, setTheme, vars: THEMES[theme] }), [theme]);
  const nativeWindVars = useMemo(() => vars(THEMES[theme]), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      <View style={[{ flex: 1 }, nativeWindVars]} className="flex-1 bg-page">
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
