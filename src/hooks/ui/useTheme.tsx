import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

export const THEME_PALETTES = [
  'heritage',
  'foret',
  'prune',
  'cuivre',
  'encre',
  'brume',
  'ocean',
  'rose',
  'olive',
  'charbon',
] as const;

export type ThemePalette = (typeof THEME_PALETTES)[number];

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedMode = 'light' | 'dark';

export const THEME_MODE_STORAGE_KEY = 'themeMode';
export const THEME_PALETTE_STORAGE_KEY = 'themePalette';

type ThemeContextType = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  palette: ThemePalette;
  setPalette: (palette: ThemePalette) => void;
  /** Mode effectivement rendu (`'light' | 'dark'`), résolu depuis le système en mode `'system'`. */
  resolvedMode: ResolvedMode;
};

const themeContext = createContext<ThemeContextType | undefined>(undefined);

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === 'light' || value === 'dark' || value === 'system';

const isThemePalette = (value: string | null): value is ThemePalette =>
  THEME_PALETTES.includes(value as ThemePalette);

export const getStoredThemeMode = (): ThemeMode => {
  const stored = localStorage.getItem(THEME_MODE_STORAGE_KEY);
  return isThemeMode(stored) ? stored : 'system';
};

export const getStoredThemePalette = (): ThemePalette => {
  const stored = localStorage.getItem(THEME_PALETTE_STORAGE_KEY);
  return isThemePalette(stored) ? stored : 'heritage';
};

const darkSchemeQuery = '(prefers-color-scheme: dark)';

const subscribeSystemDark = (onChange: () => void) => {
  const media = window.matchMedia(darkSchemeQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};

const getSystemDark = () => window.matchMedia(darkSchemeQuery).matches;

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setModeState] = useState<ThemeMode>(getStoredThemeMode);
  const [palette, setPaletteState] = useState<ThemePalette>(getStoredThemePalette);
  const systemPrefersDark = useSyncExternalStore(subscribeSystemDark, getSystemDark, () => false);

  const resolvedMode: ResolvedMode =
    mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode;

  // Les deux attributs sont toujours posés : `data-palette` porte la préférence de
  // thème (« heritage » par défaut, slugs des thèmes hors-marque du lot 11).
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedMode);
    document.documentElement.setAttribute('data-palette', palette);
  }, [resolvedMode, palette]);

  useEffect(() => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem(THEME_PALETTE_STORAGE_KEY, palette);
  }, [palette]);

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const setPalette = useCallback((next: ThemePalette) => setPaletteState(next), []);

  const value = useMemo(
    () => ({ mode, setMode, palette, setPalette, resolvedMode }),
    [mode, setMode, palette, setPalette, resolvedMode],
  );

  return <themeContext.Provider value={value}>{children}</themeContext.Provider>;
};

const useTheme = () => {
  const context = useContext(themeContext);
  if (!context) {
    throw Error('useTheme doit être utilisé dans un <ThemeProvider>');
  }
  return context;
};

export default useTheme;
