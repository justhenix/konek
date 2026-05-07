const INTERNAL_PLACEHOLDER_VALUES = new Set([
  'undefined',
  'null',
  '[object Object]',
]);

export const cleanReceiptValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value !== 'string') {
    return '';
  }

  const normalizedValue = value.trim();

  return normalizedValue && !INTERNAL_PLACEHOLDER_VALUES.has(normalizedValue)
    ? normalizedValue
    : '';
};

export const truncateMiddle = (value, startLength = 8, endLength = 8) => {
  const normalizedValue = cleanReceiptValue(value);

  if (!normalizedValue) {
    return '';
  }

  if (normalizedValue.length <= startLength + endLength + 3) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, startLength)}...${normalizedValue.slice(-endLength)}`;
};

export const buildReceiptSummary = ({ title, fields = [], disclaimer }) => {
  const lines = [cleanReceiptValue(title) || 'KonekPay receipt'];

  fields.forEach(({ label, value }) => {
    const cleanLabel = cleanReceiptValue(label);
    const cleanValue = cleanReceiptValue(value);

    if (cleanLabel && cleanValue) {
      lines.push(`${cleanLabel}: ${cleanValue}`);
    }
  });

  const cleanDisclaimer = cleanReceiptValue(disclaimer);

  if (cleanDisclaimer) {
    lines.push('', cleanDisclaimer);
  }

  return lines.join('\n');
};
