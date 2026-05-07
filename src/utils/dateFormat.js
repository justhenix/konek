const LANGUAGE_LOCALES = {
  en: 'en-US',
  id: 'id-ID',
};

const getBrowserLocale = () => {
  if (typeof globalThis.navigator?.language === 'string' && globalThis.navigator.language) {
    return globalThis.navigator.language;
  }

  return 'en-US';
};

export const getLocaleForLanguage = (language) => (
  LANGUAGE_LOCALES[language] || getBrowserLocale()
);

const toValidDate = (value) => {
  if (value === null || value === undefined || value === '') return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

const formatWithOptions = (value, language, options) => {
  const date = toValidDate(value);

  if (!date) {
    return '';
  }

  const locale = getLocaleForLanguage(language);

  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  }
};

export const formatDateTime = (value, language, options = {}) => (
  formatWithOptions(value, language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  })
);

export const formatDate = (value, language, options = {}) => (
  formatWithOptions(value, language, {
    dateStyle: 'medium',
    ...options,
  })
);

export const formatTime = (value, language, options = {}) => (
  formatWithOptions(value, language, {
    timeStyle: 'short',
    ...options,
  })
);
