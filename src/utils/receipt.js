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

export const copyTextToClipboard = async (text) => {
  const cleanText = cleanReceiptValue(text);

  if (!cleanText) {
    return false;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(cleanText);
      return true;
    } catch {
      // Fall through to the textarea copy path below.
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textArea = document.createElement('textarea');
  textArea.value = cleanText;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';

  document.body.appendChild(textArea);
  textArea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
};

export const downloadTextFile = ({ fileName, text }) => {
  if (
    typeof document === 'undefined'
    || typeof Blob === 'undefined'
    || typeof URL === 'undefined'
  ) {
    return false;
  }

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(downloadUrl);

  return true;
};

export const createReceiptFileName = (signature) => {
  const suffix = cleanReceiptValue(signature).slice(0, 8) || new Date().toISOString().slice(0, 10);
  return `konekpay-receipt-${suffix}.txt`;
};
