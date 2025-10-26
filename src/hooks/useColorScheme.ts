import { useContext } from 'react';
import { ThemeContext } from '@/src/theme/ThemeProvider';

// returns the effective scheme ('light' | 'dark'), reacts to both user pref & system changes
export function useColorScheme() {
  const { colorScheme } = useContext(ThemeContext);
  return colorScheme;
}

// also expose current pref + setter if you need them in Settings
export function useThemePref() {
  const { pref, setPref } = useContext(ThemeContext);
  return { pref, setPref };
}
