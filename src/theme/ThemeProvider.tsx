import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import { getSetting, saveSetting } from '@/src/db';

export type ThemePref = 'system' | 'light' | 'dark';

type Ctx = {
  pref: ThemePref;
  system: ColorSchemeName; // 'light' | 'dark' | null
  colorScheme: 'light' | 'dark';
  setPref: (p: ThemePref) => Promise<void> | void;
};

export const ThemeContext = createContext<Ctx>({
  pref: 'system',
  system: Appearance.getColorScheme(),
  colorScheme: (Appearance.getColorScheme() ?? 'light') as 'light' | 'dark',
  setPref: () => {},
});

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [pref, setPrefState] = useState<ThemePref>('system');
  const [system, setSystem] = useState<ColorSchemeName>(Appearance.getColorScheme());

  // load saved preference + subscribe to system changes
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = (await getSetting('theme', 'system')) as ThemePref;
        if (mounted) setPrefState(stored ?? 'system');
      } catch {}
    })();
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystem(colorScheme));
    return () => { mounted = false; sub.remove(); };
  }, []);

  const setPref = useCallback(async (p: ThemePref) => {
    setPrefState(p);
    try { await saveSetting('theme', p); } catch {}
  }, []);

  const colorScheme: 'light' | 'dark' = useMemo(() => {
    const sys = (system ?? 'light') as 'light' | 'dark';
    return pref === 'system' ? sys : pref;
  }, [pref, system]);

  const value = useMemo(() => ({ pref, system, colorScheme, setPref }), [pref, system, colorScheme, setPref]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
