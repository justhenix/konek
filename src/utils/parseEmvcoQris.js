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
  transactionAmount: '54',
  merchantName: '59',
  transactionCurrency: '53',
};

const createEmptyResult = (rawData, errors = []) => ({
  rawData,
  isValid: false,
  isTlvValid: false,
  hasRequiredTags: false,
  merchantName: '',
  amount: null,
  amountText: '',
  formattedAmount: 'Not provided',
  currencyCode: '',
  tags: {
    [TAGS.transactionAmount]: '',
    [TAGS.merchantName]: '',
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

    const amountText = (valuesByTag[TAGS.transactionAmount] || '').trim();
    const merchantName = (valuesByTag[TAGS.merchantName] || '').trim();
    const amount = amountText === '' ? null : Number(amountText);
    const errors = [];

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

    if (!amountText) {
      errors.push('Tag 54 transaction amount is missing.');
    } else if (!Number.isFinite(amount)) {
      errors.push('Tag 54 transaction amount is not numeric.');
    }

    if (!merchantName) {
      errors.push('Tag 59 merchant name is missing.');
    }

    const hasRequiredTags = Boolean(amountText && merchantName && Number.isFinite(amount));

    return {
      rawData,
      isValid: errors.length === 0,
      isTlvValid: true,
      hasRequiredTags,
      merchantName,
      amount,
      amountText,
      formattedAmount: formatIdrAmount(amount),
      currencyCode: valuesByTag[TAGS.transactionCurrency] || '',
      tags: {
        [TAGS.transactionAmount]: amountText,
        [TAGS.merchantName]: merchantName,
        [TAGS.transactionCurrency]: valuesByTag[TAGS.transactionCurrency] || '',
      },
      segments,
      errors,
    };
  } catch (error) {
    return createEmptyResult(rawData, [error.message || 'Unable to parse QR payload.']);
  }
};
