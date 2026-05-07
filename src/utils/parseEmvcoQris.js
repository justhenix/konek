const REQUIRED_QRIS_PREFIX = '000201';

export const calculateCrc16 = (payload) => {
  let crc = 0xFFFF;
  const bytes = new TextEncoder().encode(payload);

  for (const byte of bytes) {
    crc ^= byte << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000)
        ? ((crc << 1) ^ 0x1021)
        : (crc << 1);
      crc &= 0xFFFF;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
};

const TAGS = {
  pointOfInitiationMethod: '01',
  transactionAmount: '54',
  merchantName: '59',
  merchantCity: '60',
  transactionCurrency: '53',
};

const createEmptyResult = (rawData, errors = []) => ({
  rawData,
  rawPayload: rawData,
  isValid: false,
  isTlvValid: false,
  hasRequiredTags: false,
  qrisType: null,
  merchantName: '',
  merchantCity: '',
  merchantId: '',
  merchantAccountInfo: null,
  amount: null,
  amountText: '',
  formattedAmount: 'Not provided',
  currencyCode: '',
  tags: {
    [TAGS.pointOfInitiationMethod]: '',
    [TAGS.transactionAmount]: '',
    [TAGS.merchantName]: '',
    [TAGS.merchantCity]: '',
    [TAGS.transactionCurrency]: '',
  },
  errors,
});

const readTlvSegments = (rawData) => {
  const segments = [];
  let cursor = 0;

  while (cursor < rawData.length) {
    const tag = rawData.slice(cursor, cursor + 2);
    const lengthText = rawData.slice(cursor + 2, cursor + 4);

    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) {
      throw new Error('Invalid TLV tag or length format.');
    }

    const length = Number(lengthText);
    const valueStart = cursor + 4;
    const valueEnd = valueStart + length;

    if (valueEnd > rawData.length) {
      throw new Error(`Tag ${tag} length exceeds the QR payload.`);
    }

    segments.push({
      tag,
      length,
      value: rawData.slice(valueStart, valueEnd),
      start: cursor,
      end: valueEnd,
    });

    cursor = valueEnd;
  }

  return segments;
};

const formatIdrAmount = (amount) => {
  if (!Number.isFinite(amount)) {
    return 'Not provided';
  }

  return amount.toLocaleString('id-ID', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
};

const STRICT_QRIS_AMOUNT_RE = /^\d+(\.0{1,2})?$/;
const MERCHANT_ACCOUNT_TAG_RE = /^(2[6-9]|3\d|4\d|5[0-1])$/;

const parseQrisAmount = (amountText, errors) => {
  if (!STRICT_QRIS_AMOUNT_RE.test(amountText)) {
    errors.push('Tag 54 transaction amount is not a valid IDR amount.');
    return null;
  }

  const amount = Number(amountText);

  if (!Number.isFinite(amount)) {
    errors.push('Tag 54 transaction amount is not numeric.');
    return null;
  }

  if (amount <= 0) {
    errors.push('Tag 54 transaction amount must be greater than zero.');
    return null;
  }

  if (amount > 1_000_000_000) {
    errors.push('Tag 54 transaction amount is too high.');
    return null;
  }

  return Math.trunc(amount);
};

const readMerchantAccountInfo = (segments) => {
  const merchantAccountSegment = segments.find((segment) => (
    MERCHANT_ACCOUNT_TAG_RE.test(segment.tag)
  ));

  if (!merchantAccountSegment) {
    return null;
  }

  const subTags = {};

  try {
    readTlvSegments(merchantAccountSegment.value).forEach((segment) => {
      subTags[segment.tag] = segment.value;
    });
  } catch {
    // Some merchant account values are opaque provider strings.
  }

  return {
    tag: merchantAccountSegment.tag,
    value: merchantAccountSegment.value,
    providerId: subTags['00'] || '',
    merchantId: subTags['01'] || subTags['02'] || subTags['03'] || '',
    subTags,
  };
};

export const parseEmvcoQris = (rawValue) => {
  const rawData = typeof rawValue === 'string' ? rawValue.trim() : '';

  if (!rawData) {
    return createEmptyResult('', ['QR payload is empty.']);
  }

  try {
    const segments = readTlvSegments(rawData);
    const valuesByTag = segments.reduce((acc, segment) => {
      acc[segment.tag] = segment.value;
      return acc;
    }, {});
    const crcSegment = segments.find((segment) => segment.tag === '63');

    const hasAmountField = Object.prototype.hasOwnProperty.call(valuesByTag, TAGS.transactionAmount);
    const amountText = (valuesByTag[TAGS.transactionAmount] || '').trim();
    const merchantName = (valuesByTag[TAGS.merchantName] || '').trim();
    const merchantCity = (valuesByTag[TAGS.merchantCity] || '').trim();
    const qrisType = hasAmountField ? 'dynamic' : 'static';
    const errors = [];
    const amount = hasAmountField ? parseQrisAmount(amountText, errors) : null;
    const merchantAccountInfo = readMerchantAccountInfo(segments);

    if (!rawData.startsWith(REQUIRED_QRIS_PREFIX)) {
      errors.push('QR payload does not start with EMVCo QRIS payload format indicator.');
    }

    if (!crcSegment) {
      errors.push('QR payload is missing CRC tag 63.');
    } else if (crcSegment.length !== 4) {
      errors.push('QR payload CRC tag 63 must be 4 characters.');
    } else {
      const payloadForCrc = rawData.slice(0, -crcSegment.value.length);
      const calculatedCrc = calculateCrc16(payloadForCrc);
      const expectedCrc = crcSegment.value.toUpperCase();

      if (calculatedCrc !== expectedCrc) {
        errors.push(`QR payload failed CRC validation (calculated: ${calculatedCrc}, expected: ${crcSegment.value}).`);
      }
    }

    if (!merchantName) {
      errors.push('Tag 59 merchant name is missing.');
    }

    const hasRequiredTags = Boolean(merchantName && (qrisType === 'static' || Number.isFinite(amount)));

    return {
      rawData,
      rawPayload: rawData,
      isValid: errors.length === 0,
      isTlvValid: true,
      hasRequiredTags,
      qrisType,
      merchantName,
      merchantCity,
      merchantId: merchantAccountInfo?.merchantId || merchantAccountInfo?.value || '',
      merchantAccountInfo,
      amount,
      amountText,
      formattedAmount: formatIdrAmount(amount),
      currencyCode: valuesByTag[TAGS.transactionCurrency] || '',
      tags: {
        [TAGS.pointOfInitiationMethod]: valuesByTag[TAGS.pointOfInitiationMethod] || '',
        [TAGS.transactionAmount]: amountText,
        [TAGS.merchantName]: merchantName,
        [TAGS.merchantCity]: merchantCity,
        [TAGS.transactionCurrency]: valuesByTag[TAGS.transactionCurrency] || '',
      },
      segments,
      errors,
    };
  } catch (error) {
    return createEmptyResult(rawData, [error.message || 'Unable to parse QR payload.']);
  }
};
