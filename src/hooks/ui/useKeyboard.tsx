import { useEffect, useEffectEvent } from 'react';

/** Global shortcuts ignore form fields, editable descendants, comboboxes and sliders. */
const useKeyboard = ({ onKeyPressed }: { onKeyPressed: (key: string) => void }) => {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.target instanceof Element &&
      event.target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"]',
      )
    ) {
      return;
    }
    onKeyPressed(event.key);
  });

  useEffect(() => {
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
};

export default useKeyboard;
