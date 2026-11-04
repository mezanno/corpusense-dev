//get a configuration param value for a given plugin
export const getValueForPluginParam = (
  pluginName: string,
  paramKey: string,
  defaultValue?: string,
): string | null => {
  const storageKey = `${pluginName}_${paramKey}`;
  return localStorage.getItem(storageKey) ?? defaultValue ?? null;
};
