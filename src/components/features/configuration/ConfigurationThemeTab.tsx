import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useTheme, { THEME_PALETTES, type ThemeMode, type ThemePalette } from '@/hooks/ui/useTheme';
import { useTranslation } from 'react-i18next';

const ConfigurationThemeTab = () => {
  const { t } = useTranslation();
  const { mode, setMode, palette, setPalette } = useTheme();

  return (
    <div className='pr-4'>
      <div className='mt-2 border p-1'>
        <strong>{t('theme_title')}</strong>
        <div className='mt-2 w-1/2'>
          <Label htmlFor='theme-palette' className='mb-1 block font-medium'>
            {t('theme_palette')}
          </Label>
          <Select value={palette} onValueChange={(value) => setPalette(value as ThemePalette)}>
            <SelectTrigger id='theme-palette'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THEME_PALETTES.map((slug) => (
                <SelectItem key={slug} value={slug}>
                  {t(`theme_palette_${slug}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='mt-2 w-1/2'>
          <Label htmlFor='theme-mode' className='mb-1 block font-medium'>
            {t('theme_mode')}
          </Label>
          <Select value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
            <SelectTrigger id='theme-mode'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='light'>{t('theme_mode_light')}</SelectItem>
              <SelectItem value='dark'>{t('theme_mode_dark')}</SelectItem>
              <SelectItem value='system'>{t('theme_mode_system')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationThemeTab;
