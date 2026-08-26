export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function ensureError(value: unknown): Error {
  if (value instanceof Error) return value;

  let stringified = '[Unable to stringify the thrown value]';
  try {
    stringified = JSON.stringify(value);
  } catch {
    /* empty */
  }

  const error = new Error(`This value was thrown as is, not through an Error: ${stringified}`);
  return error;
}

export function onlyLettersAndNumbers(str: string) {
  return /^[A-Za-z0-9]*$/.test(str);
}

export const truncateMiddle = (text: string, { start = 10, end = 9, separator = '…' } = {}) => {
  if (!text) return '';

  const max = start + end + separator.length;

  if (text.length <= max) {
    return text;
  }

  return [text.slice(0, start), separator, text.slice(text.length - end)].join('');
};
