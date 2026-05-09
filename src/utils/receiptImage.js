/**
 * Deterministic canvas-based receipt PNG generator.
 *
 * Replaces html-to-image which produced blank output when the export
 * DOM node was positioned off-screen (left: -12000px).
 *
 * Canvas rendering is immune to DOM positioning, CSS clipping, and
 * foreignObject serialization bugs.
 */

const RECEIPT_WIDTH = 1080;
const RECEIPT_HEIGHT = 1350;

const COLORS = {
  bg: '#07120e',
  paperBg: '#111c18',
  paperBorder: 'rgba(20, 241, 149, 0.18)',
  text: '#f7fff9',
  textMuted: 'rgba(247, 255, 249, 0.64)',
  textSoft: 'rgba(247, 255, 249, 0.58)',
  brand: '#14f195',
  brandSoft: 'rgba(20, 241, 149, 0.74)',
  purple: '#9945ff',
  purpleBorder: 'rgba(153, 69, 255, 0.32)',
  mono: '#dfffee',
  warning: '#f6d878',
  badgeBg: 'rgba(20, 241, 149, 0.12)',
  badgeBorder: 'rgba(20, 241, 149, 0.34)',
  divider: 'rgba(247, 255, 249, 0.14)',
  dividerDashed: 'rgba(247, 255, 249, 0.16)',
  accentGreen: 'rgba(20, 241, 149, 0.38)',
  accentPurple: 'rgba(153, 69, 255, 0.28)',
};

const FONT_SANS = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const FONT_MONO = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';

const PAPER_X = 80;
const PAPER_Y = 70;
const PAPER_W = RECEIPT_WIDTH - PAPER_X * 2;
const PAPER_INNER_PAD = 58;
const CONTENT_X = PAPER_X + PAPER_INNER_PAD;
const CONTENT_W = PAPER_W - PAPER_INNER_PAD * 2;

/**
 * Wrap text to fit within maxWidth, returning an array of lines.
 */
function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

/**
 * Draw a radial gradient glow on the background.
 */
function drawBackground(ctx) {
  // Base fill
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, RECEIPT_WIDTH, RECEIPT_HEIGHT);

  // Green glow top-left
  const gGreen = ctx.createRadialGradient(
    RECEIPT_WIDTH * 0.18, RECEIPT_HEIGHT * 0.12, 0,
    RECEIPT_WIDTH * 0.18, RECEIPT_HEIGHT * 0.12, RECEIPT_WIDTH * 0.38,
  );
  gGreen.addColorStop(0, 'rgba(20, 241, 149, 0.14)');
  gGreen.addColorStop(1, 'transparent');
  ctx.fillStyle = gGreen;
  ctx.fillRect(0, 0, RECEIPT_WIDTH, RECEIPT_HEIGHT);

  // Purple glow top-right
  const gPurple = ctx.createRadialGradient(
    RECEIPT_WIDTH * 0.84, RECEIPT_HEIGHT * 0.18, 0,
    RECEIPT_WIDTH * 0.84, RECEIPT_HEIGHT * 0.18, RECEIPT_WIDTH * 0.38,
  );
  gPurple.addColorStop(0, 'rgba(153, 69, 255, 0.12)');
  gPurple.addColorStop(1, 'transparent');
  ctx.fillStyle = gPurple;
  ctx.fillRect(0, 0, RECEIPT_WIDTH, RECEIPT_HEIGHT);
}

/**
 * Draw the paper card background with border and clean bottom edge.
 */
function drawPaper(ctx, paperHeight) {
  // Card fill
  ctx.fillStyle = COLORS.paperBg;
  ctx.fillRect(PAPER_X, PAPER_Y, PAPER_W, paperHeight);

  // Card border (all four sides)
  ctx.strokeStyle = COLORS.paperBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAPER_X, PAPER_Y, PAPER_W, paperHeight);

  // Subtle gradient overlay at top of card
  const overlay = ctx.createLinearGradient(PAPER_X, PAPER_Y, PAPER_X, PAPER_Y + paperHeight * 0.18);
  overlay.addColorStop(0, 'rgba(255, 255, 255, 0.018)');
  overlay.addColorStop(1, 'transparent');
  ctx.fillStyle = overlay;
  ctx.fillRect(PAPER_X + 1, PAPER_Y + 1, PAPER_W - 2, paperHeight * 0.18);

  // Bottom accent: thin green-to-purple gradient line at card bottom edge
  const bottomAccentY = PAPER_Y + paperHeight - 3;
  const accentGrad = ctx.createLinearGradient(PAPER_X, 0, PAPER_X + PAPER_W, 0);
  accentGrad.addColorStop(0, COLORS.accentGreen);
  accentGrad.addColorStop(0.5, COLORS.accentPurple);
  accentGrad.addColorStop(1, COLORS.accentGreen);
  ctx.fillStyle = accentGrad;
  ctx.fillRect(PAPER_X + 1, bottomAccentY, PAPER_W - 2, 2);
}

/**
 * Draw a horizontal divider line.
 */
function drawDivider(ctx, y, dashed) {
  ctx.save();
  ctx.strokeStyle = dashed ? COLORS.dividerDashed : COLORS.divider;
  ctx.lineWidth = 1;
  if (dashed) {
    ctx.setLineDash([8, 6]);
  }
  ctx.beginPath();
  ctx.moveTo(CONTENT_X, y);
  ctx.lineTo(CONTENT_X + CONTENT_W, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw a label-value row, returning the height consumed.
 */
function drawRow(ctx, y, label, value, opts = {}) {
  if (!value) return 0;

  const { mono, accent, badge } = opts;
  const rowPad = 16;
  const labelWidth = 250;
  const valueMaxWidth = CONTENT_W - labelWidth - 36;
  const fontSize = mono ? 19 : 22;

  // Label
  ctx.font = `400 22px ${FONT_SANS}`;
  ctx.fillStyle = COLORS.textMuted;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(label, CONTENT_X, y + rowPad);

  if (badge) {
    // Badge rendering
    ctx.font = `720 18px ${FONT_SANS}`;
    const badgeText = value;
    const badgeMetrics = ctx.measureText(badgeText);
    const badgePadX = 18;
    const badgePadY = 10;
    const badgeW = badgeMetrics.width + badgePadX * 2;
    const badgeH = 18 + badgePadY * 2;
    const badgeX = CONTENT_X + CONTENT_W - badgeW;
    const badgeY = y + rowPad - 4;

    ctx.fillStyle = COLORS.badgeBg;
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    ctx.strokeStyle = COLORS.badgeBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

    ctx.fillStyle = COLORS.brand;
    ctx.textAlign = 'center';
    ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgePadY);
    ctx.textAlign = 'left';

    return rowPad * 2 + Math.max(30, badgeH);
  }

  // Value
  const fontFamily = mono ? FONT_MONO : FONT_SANS;
  ctx.font = `${mono ? 400 : 640} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = accent ? COLORS.brand : (mono ? COLORS.mono : COLORS.text);
  ctx.textAlign = 'right';

  const lines = wrapText(ctx, value, valueMaxWidth);
  const lineHeight = fontSize * 1.35;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], CONTENT_X + CONTENT_W, y + rowPad + i * lineHeight);
  }
  ctx.textAlign = 'left';

  return rowPad * 2 + Math.max(30, lines.length * lineHeight);
}

/**
 * Draw a dashed cut line with subtle scissors hint.
 * Placed above the footer as a clean receipt-style separator.
 */
function drawCutLine(ctx, y) {
  ctx.save();
  ctx.strokeStyle = 'rgba(247, 255, 249, 0.12)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(CONTENT_X, y);
  ctx.lineTo(CONTENT_X + CONTENT_W, y);
  ctx.stroke();
  ctx.restore();
}

/**
 * Create a receipt PNG blob using Canvas 2D rendering.
 *
 * @param {object} receiptData - The receipt data to render.
 * @param {object} [options] - Optional rendering options.
 * @returns {Promise<Blob>} PNG blob of the rendered receipt.
 */
export async function createReceiptPngBlob(receiptData, options = {}) {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Continue with fallback fonts.
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = options.width || RECEIPT_WIDTH;
  canvas.height = options.height || RECEIPT_HEIGHT;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context could not be created.');
  }

  const {
    title = 'KonekPay receipt',
    timestamp = '',
    store = '',
    city = '',
    qrisType = '',
    totalIdr = '',
    solPaid = '',
    status = '',
    network = 'Solana Devnet',
    transactionId = '',
    explorerUrl = '',
    disclaimer = '',
    labels = {},
  } = receiptData;

  // -- Background --
  drawBackground(ctx);

  // -- Paper card --
  const paperHeight = RECEIPT_HEIGHT - PAPER_Y * 2 - 10;
  drawPaper(ctx, paperHeight);

  let cursorY = PAPER_Y + PAPER_INNER_PAD;

  // -- Header: title + network on left, timestamp on right --
  ctx.font = `760 36px ${FONT_SANS}`;
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(title, CONTENT_X, cursorY);

  ctx.font = `400 20px ${FONT_SANS}`;
  ctx.fillStyle = COLORS.textSoft;
  ctx.fillText(network, CONTENT_X, cursorY + 46);

  if (timestamp) {
    ctx.font = `400 19px ${FONT_MONO}`;
    ctx.fillStyle = COLORS.mono;
    ctx.textAlign = 'right';
    const tsLines = wrapText(ctx, timestamp, CONTENT_W * 0.45);
    for (let i = 0; i < tsLines.length; i++) {
      ctx.fillText(tsLines[i], CONTENT_X + CONTENT_W, cursorY + 6 + i * 26);
    }
    ctx.textAlign = 'left';
  }

  cursorY += 96;

  // -- Header divider --
  drawDivider(ctx, cursorY, false);
  cursorY += 40;

  // -- Amount section --
  if (labels.totalIdr) {
    ctx.font = `720 19px ${FONT_SANS}`;
    ctx.fillStyle = COLORS.brandSoft;
    ctx.textAlign = 'left';
    ctx.fillText(labels.totalIdr.toUpperCase(), CONTENT_X, cursorY);
    cursorY += 32;
  }

  if (totalIdr) {
    ctx.font = `820 56px ${FONT_SANS}`;
    ctx.fillStyle = COLORS.brand;
    ctx.textAlign = 'left';
    ctx.fillText(totalIdr, CONTENT_X, cursorY);
    cursorY += 66;
  }

  if (solPaid) {
    ctx.font = `400 25px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(247, 255, 249, 0.76)';
    ctx.textAlign = 'left';
    ctx.fillText(solPaid, CONTENT_X, cursorY);
    cursorY += 40;
  }

  cursorY += 10;

  // -- Section divider --
  drawDivider(ctx, cursorY, true);
  cursorY += 12;

  // -- Detail rows --
  cursorY += drawRow(ctx, cursorY, labels.store || 'Store', store);
  cursorY += drawRow(ctx, cursorY, labels.city || 'City', city);
  cursorY += drawRow(ctx, cursorY, labels.qrisType || 'QRIS Type', qrisType);
  cursorY += drawRow(ctx, cursorY, labels.solPaid || 'SOL Paid', solPaid, { accent: true });
  cursorY += drawRow(ctx, cursorY, labels.status || 'Status', status, { badge: true });
  cursorY += drawRow(ctx, cursorY, labels.network || 'Network', network, { accent: true });

  // -- Section divider --
  drawDivider(ctx, cursorY, true);
  cursorY += 12;

  // -- Transaction section --
  const shortTx = truncateForCanvas(transactionId, 14, 14);
  cursorY += drawRow(ctx, cursorY, labels.transactionId || 'Transaction ID', shortTx, { mono: true });

  if (explorerUrl) {
    const shortUrl = explorerUrl.length > 60
      ? explorerUrl.slice(0, 57) + '...'
      : explorerUrl;
    cursorY += drawRow(ctx, cursorY, labels.explorerLink || 'Explorer Link', shortUrl, { mono: true });
  }

  // -- Footer area --
  // Compute footer Y with proper spacing from content and card bottom
  const footerBottomPad = 48;
  const footerContentH = 56;
  const footerY = PAPER_Y + paperHeight - footerBottomPad - footerContentH;

  // Dashed cut line above footer (clean receipt-style separator)
  drawCutLine(ctx, footerY);

  // Disclaimer text
  if (disclaimer) {
    ctx.font = `400 19px ${FONT_SANS}`;
    ctx.fillStyle = COLORS.warning;
    ctx.textAlign = 'left';
    const disclaimerLines = wrapText(ctx, disclaimer, CONTENT_W * 0.72);
    for (let i = 0; i < disclaimerLines.length; i++) {
      ctx.fillText(disclaimerLines[i], CONTENT_X, footerY + 22 + i * 28);
    }
  }

  // Brand name
  ctx.font = `760 19px ${FONT_SANS}`;
  ctx.fillStyle = 'rgba(20, 241, 149, 0.82)';
  ctx.textAlign = 'right';
  ctx.fillText('KonekPay', CONTENT_X + CONTENT_W, footerY + 22);
  ctx.textAlign = 'left';

  // -- Generate PNG blob --
  return canvasToBlob(canvas);
}

/**
 * Convert canvas to PNG Blob.
 * canvas.toBlob may return null if the image cannot be created.
 */
function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Receipt image could not be created.'));
      }
    }, 'image/png');
  });
}

/**
 * Truncate a string in the middle for display.
 */
function truncateForCanvas(value, startLen = 14, endLen = 14) {
  if (!value || typeof value !== 'string') return '';
  if (value.length <= startLen + endLen + 3) return value;
  return `${value.slice(0, startLen)}...${value.slice(-endLen)}`;
}
