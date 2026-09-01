const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { sanitizePetitionText, isBlank } = require('../helpers/llmUtils');
const {
  extractTextFromFilePath,
  ensureExtension,
  isImageFormat,
  isDocumentFormat,
  sniffFormatFromBuffer,
  resolveMimeType,
  OcrNotConfiguredError
} = require('./ocrService');

/**
 * Unified petition document extraction — images, PDFs, Word, plain text.
 * Detects format from magic bytes + extension + MIME (not MIME alone).
 * PDFs: native text layer when trustworthy; image/scanned PDFs → 100% OCR (no embedded).
 *
 * Tune via env (all optional):
 *   DOCUMENT_PDF_FORCE_OCR=auto|always|never
 *   DOCUMENT_MIN_CHARS, DOCUMENT_MIN_CHARS_PER_PAGE, DOCUMENT_MIN_WORDS,
 *   DOCUMENT_MIN_ALNUM_RATIO, DOCUMENT_SCAN_MIN_FILE_BYTES,
 *   DOCUMENT_SCAN_SUSPICIOUS_BYTES_PER_CHAR, OCR_PROFILE
 */

const readIntEnv = (key, fallback) => {
  const parsed = parseInt(process.env[key] || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readFloatEnv = (key, fallback) => {
  const parsed = parseFloat(process.env[key] || '');
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePdfForceOcrMode = (value) => {
  const mode = String(value || 'auto').trim().toLowerCase();
  if (mode === 'always' || mode === 'never') return mode;
  return 'auto';
};

/** Producers/creators common when photos or scans are wrapped as PDF. */
const IMAGE_PDF_METADATA = /jspdf|fpdf|libharu|reportlab|imagemagick|ghostscript|gscan|scan|scanner|camscanner|adobe scan|pdfium|photos|preview|print to pdf|microsoft print|wkhtml|headlesschrome|chrome pdf|smallpdf|ilovepdf|pdf24|png|jpeg|jpg2pdf|image.?to.?pdf/i;

const EXTRACTION_CONFIG = {
  minChars: readIntEnv('DOCUMENT_MIN_CHARS', 150),
  minCharsPerPage: readIntEnv('DOCUMENT_MIN_CHARS_PER_PAGE', 80),
  minWords: readIntEnv('DOCUMENT_MIN_WORDS', 20),
  minAlnumRatio: readFloatEnv('DOCUMENT_MIN_ALNUM_RATIO', 0.25),
  scanMinFileBytes: readIntEnv('DOCUMENT_SCAN_MIN_FILE_BYTES', 50_000),
  scanSuspiciousBytesPerChar: readIntEnv('DOCUMENT_SCAN_SUSPICIOUS_BYTES_PER_CHAR', 400),
  pdfForceOcr: normalizePdfForceOcrMode(process.env.DOCUMENT_PDF_FORCE_OCR),
  pdfImageTextOpMax: readIntEnv('DOCUMENT_PDF_IMAGE_TEXT_OP_MAX', 8),
  ocrProfile: (process.env.OCR_PROFILE || 'petition').trim().toLowerCase()
};

const UPLOAD_KIND = {
  TEXT: 'text',
  IMAGE: 'image',
  PDF: 'pdf',
  WORD: 'word'
};

const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

const alnumRatio = (text) => {
  if (!text.length) return 0;
  const alnum = (text.match(/[\p{L}\p{N}]/gu) || []).length;
  return alnum / text.length;
};

/**
 * Score extracted text quality (0–100). Used to choose embedded vs OCR and to gate fallback.
 */
const assessTextQuality = (text, context = {}) => {
  const cleaned = sanitizePetitionText(text);
  if (!cleaned) {
    return {
      sufficient: false,
      score: 0,
      charCount: 0,
      wordCount: 0,
      charsPerPage: 0,
      alnumRatio: 0,
      reasons: ['empty']
    };
  }

  const cfg = EXTRACTION_CONFIG;
  const charCount = cleaned.length;
  const wordCount = countWords(cleaned);
  const pageCount = Math.max(1, context.pageCount || 1);
  const charsPerPage = charCount / pageCount;
  const ratio = alnumRatio(cleaned);
  const reasons = [];

  if (charCount < cfg.minChars) reasons.push(`short (${charCount} chars)`);
  if (charsPerPage < cfg.minCharsPerPage) {
    reasons.push(`sparse (${Math.round(charsPerPage)} chars/page)`);
  }
  if (wordCount < cfg.minWords) reasons.push(`few words (${wordCount})`);
  if (ratio < cfg.minAlnumRatio) reasons.push('low readable character ratio');

  if (context.fileSizeBytes >= cfg.scanMinFileBytes) {
    const bytesPerChar = context.fileSizeBytes / Math.max(1, charCount);
    if (bytesPerChar >= cfg.scanSuspiciousBytesPerChar) {
      reasons.push(`likely scanned/image PDF (${Math.round(bytesPerChar)} bytes/char)`);
    }
  }

  const score =
    Math.min(35, (charCount / cfg.minChars) * 35)
    + Math.min(25, (charsPerPage / cfg.minCharsPerPage) * 25)
    + Math.min(25, (wordCount / cfg.minWords) * 25)
    + Math.min(15, (ratio / cfg.minAlnumRatio) * 15);

  return {
    sufficient: reasons.length === 0,
    score: Math.round(score),
    charCount,
    wordCount,
    charsPerPage,
    alnumRatio: ratio,
    reasons
  };
};

const pickBestCandidate = (candidates, { ocrOnly = false } = {}) => {
  const pool = ocrOnly
    ? candidates.filter((c) => c.source === 'pdf-ocr')
    : candidates;

  const ranked = pool
    .map((c) => ({ ...c, quality: assessTextQuality(c.text, c.context) }))
    .filter((c) => !isBlank(c.text))
    .sort((a, b) => {
      if (ocrOnly) return b.text.length - a.text.length || b.quality.score - a.quality.score;
      return b.quality.score - a.quality.score || b.text.length - a.text.length;
    });

  return ranked[0] || null;
};

/**
 * Inspect PDF bytes for image-page structure (photo/scan → PDF converters).
 * Returns forceOcrOnly when embedded text cannot be trusted.
 */
const inspectPdfBuffer = (buffer) => {
  const sample = buffer.subarray(0, Math.min(buffer.length, 512 * 1024));
  const raw = sample.toString('latin1');

  const imageObjects = (raw.match(/\/Subtype\s*\/Image\b/g) || []).length;
  const jpegStreams = (raw.match(/\/Filter\s*\/DCTDecode\b/g) || []).length;
  const jp2Streams = (raw.match(/\/Filter\s*\/JPXDecode\b/g) || []).length;
  const textOps = (raw.match(/\bTj\b/g) || []).length + (raw.match(/\bTJ\b/g) || []).length;

  const producer = ((raw.match(/\/Producer\s*\(([^)]*)\)/) || [])[1] || '').trim();
  const creator = ((raw.match(/\/Creator\s*\(([^)]*)\)/) || [])[1] || '').trim();
  const metadata = `${producer} ${creator}`;

  const imageMetadata = IMAGE_PDF_METADATA.test(metadata);
  const hasRasterContent = imageObjects > 0 || jpegStreams > 0 || jp2Streams > 0;
  const noTextOperators = textOps === 0 && hasRasterContent;
  const imageHeavy = hasRasterContent && textOps <= EXTRACTION_CONFIG.pdfImageTextOpMax;

  const reasons = [];
  if (imageMetadata) reasons.push(`metadata (${producer || creator || 'image PDF tool'})`);
  if (noTextOperators) reasons.push('no text operators (scan/photo PDF)');
  if (imageHeavy && !noTextOperators) reasons.push(`image-heavy (${imageObjects} image(s), ${textOps} text op(s))`);

  return {
    imageObjects,
    jpegStreams,
    textOps,
    producer,
    creator,
    forceOcrOnly: imageMetadata || noTextOperators || imageHeavy,
    reasons
  };
};

const resolvePdfExtractionMode = (buffer, fileSizeBytes, embeddedText = '', pageCount = 1) => {
  const cfg = EXTRACTION_CONFIG;
  if (cfg.pdfForceOcr === 'always') {
    return { mode: 'ocr_only', reasons: ['DOCUMENT_PDF_FORCE_OCR=always'] };
  }
  if (cfg.pdfForceOcr === 'never') {
    return { mode: 'embedded_first', reasons: ['DOCUMENT_PDF_FORCE_OCR=never'] };
  }

  const inspection = inspectPdfBuffer(buffer);
  if (inspection.forceOcrOnly) {
    return { mode: 'ocr_only', reasons: inspection.reasons, inspection };
  }

  const embeddedQuality = assessTextQuality(embeddedText, { pageCount, fileSizeBytes });
  if (!embeddedQuality.sufficient) {
    return {
      mode: 'ocr_fallback',
      reasons: embeddedQuality.reasons,
      inspection
    };
  }

  return { mode: 'embedded_ok', reasons: [], inspection };
};

const readUploadBuffer = (filePath) => fs.readFileSync(filePath);

const detectUploadKind = (file, buffer) => {
  const mime = String(file.mimetype || '').toLowerCase();
  const name = file.originalname || path.basename(file.path || '');
  const sniffed = sniffFormatFromBuffer(buffer);

  if (mime.startsWith('text/') || name.toLowerCase().endsWith('.txt')) {
    return UPLOAD_KIND.TEXT;
  }
  if (sniffed === 'pdf' || mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
    return UPLOAD_KIND.PDF;
  }
  if (
    sniffed === 'docx'
    || sniffed === 'doc'
    || mime.includes('wordprocessingml')
    || mime === 'application/msword'
    || /\.docx?$/i.test(name)
  ) {
    return UPLOAD_KIND.WORD;
  }
  if (isImageFormat(mime, name, buffer)) {
    return UPLOAD_KIND.IMAGE;
  }
  return null;
};

const resolveFilename = (file, kind, buffer) => {
  const original = file.originalname || path.basename(file.path || 'upload');
  if (kind === UPLOAD_KIND.PDF) return ensureExtension(original, '.pdf');
  if (kind === UPLOAD_KIND.WORD) {
    const sniffed = sniffFormatFromBuffer(buffer);
    return ensureExtension(original, sniffed === 'doc' ? '.doc' : '.docx');
  }
  return original;
};

const extractPlainText = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return sanitizePetitionText(raw);
};

const extractPdfEmbedded = async (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const { text, numpages } = await pdfParse(buffer);
  return {
    text: sanitizePetitionText(text || ''),
    pageCount: Math.max(1, numpages || 1)
  };
};

const extractViaOcrGateway = async (filePath, mimeType, filename) =>
  extractTextFromFilePath(filePath, mimeType, {
    profile: EXTRACTION_CONFIG.ocrProfile,
    filename
  });

const extractPdf = async (file, buffer, fileSizeBytes) => {
  const filename = resolveFilename(file, UPLOAD_KIND.PDF, buffer);
  const mimeType = resolveMimeType(file.mimetype, filename, buffer);

  let embedded = { text: '', pageCount: 1 };
  let embeddedError = null;

  const inspection = inspectPdfBuffer(buffer);
  const preMode = resolvePdfExtractionMode(buffer, fileSizeBytes);

  if (preMode.mode === 'ocr_only') {
    console.log(
      `[Document Extract] PDF OCR-only (${preMode.reasons.join('; ') || 'image/scanned PDF'}) — skipping embedded text`
    );
    const ocrText = sanitizePetitionText(
      await extractViaOcrGateway(file.path, mimeType, filename)
    );
    if (isBlank(ocrText)) {
      throw new Error(
        'OCR returned no readable text from this image-based PDF. Upload the original photo/scan if possible.'
      );
    }
    console.log(`[Document Extract] PDF via pdf-ocr (100%) — ${ocrText.length} chars`);
    return ocrText;
  }

  try {
    embedded = await extractPdfEmbedded(file.path);
  } catch (err) {
    embeddedError = err;
  }

  const mode = embeddedError
    ? { mode: 'ocr_fallback', reasons: [`parse failed (${embeddedError.message})`] }
    : resolvePdfExtractionMode(buffer, fileSizeBytes, embedded.text, embedded.pageCount);

  const candidates = [];
  if (mode.mode === 'embedded_ok' && !isBlank(embedded.text)) {
    candidates.push({
      text: embedded.text,
      source: 'pdf-embedded',
      context: { pageCount: embedded.pageCount, fileSizeBytes }
    });
  }

  const needsOcr = mode.mode !== 'embedded_ok' || candidates.length === 0;
  if (needsOcr) {
    const reason = mode.reasons.join(', ') || 'low quality embedded text';
    console.log(`[Document Extract] PDF ${reason}; running OCR...`);

    try {
      const ocrText = await extractViaOcrGateway(file.path, mimeType, filename);
      candidates.push({
        text: sanitizePetitionText(ocrText),
        source: 'pdf-ocr',
        context: { pageCount: embedded.pageCount, fileSizeBytes, inspection }
      });
    } catch (err) {
      if (err instanceof OcrNotConfiguredError) throw err;
      if (candidates.length === 0) {
        throw new Error(`PDF OCR failed: ${err.message}`);
      }
      console.warn(`[Document Extract] PDF OCR failed, using embedded text: ${err.message}`);
    }
  }

  const preferOcrOnly = inspection.forceOcrOnly && candidates.some((c) => c.source === 'pdf-ocr');
  const best = pickBestCandidate(candidates, { ocrOnly: preferOcrOnly });
  if (!best) {
    throw new Error('No text could be extracted from this PDF. Try a clearer scan or a text-based export.');
  }

  console.log(
    `[Document Extract] PDF via ${best.source}${best.source === 'pdf-ocr' && inspection.forceOcrOnly ? ' (100%)' : ''} — ` +
      `${best.quality.charCount} chars, score=${best.quality.score}` +
      `${best.quality.reasons.length ? ` (${best.quality.reasons.join('; ')})` : ''}`
  );
  return best.text;
};

const extractImage = async (file, buffer) => {
  const filename = resolveFilename(file, UPLOAD_KIND.IMAGE, buffer);
  const mimeType = resolveMimeType(file.mimetype, filename, buffer);
  const text = await extractViaOcrGateway(file.path, mimeType, filename);
  const cleaned = sanitizePetitionText(text);
  if (isBlank(cleaned)) {
    throw new Error('OCR returned no readable text from this image.');
  }
  console.log(`[Document Extract] Image OCR — ${cleaned.length} chars`);
  return cleaned;
};

const extractWord = async (file, buffer) => {
  const filename = resolveFilename(file, UPLOAD_KIND.WORD, buffer);
  const mimeType = resolveMimeType(file.mimetype, filename, buffer);
  const text = await extractViaOcrGateway(file.path, mimeType, filename);
  const cleaned = sanitizePetitionText(text);
  if (isBlank(cleaned)) {
    throw new Error('No text could be extracted from this Word document.');
  }
  console.log(`[Document Extract] Word OCR — ${cleaned.length} chars`);
  return cleaned;
};

/**
 * Extract petition text from a multer upload ({ path, mimetype, originalname }).
 * @returns {Promise<string>}
 */
const extractPetitionTextFromUpload = async (file) => {
  if (!file?.path) {
    throw new Error('No file was uploaded.');
  }

  const buffer = readUploadBuffer(file.path);
  const fileSizeBytes = buffer.length;
  const kind = detectUploadKind(file, buffer);

  if (!kind) {
    throw new Error(
      'Unsupported file type. Upload a petition as plain text (.txt), image (PNG/JPEG/WEBP/TIFF/BMP), PDF, or Word (.doc/.docx).'
    );
  }

  console.log(
    `[Document Extract] kind=${kind}, mime=${file.mimetype || '?'}, ` +
      `name=${file.originalname || path.basename(file.path)}, bytes=${fileSizeBytes}`
  );

  let rawContent = '';
  switch (kind) {
    case UPLOAD_KIND.TEXT:
      rawContent = extractPlainText(file.path);
      break;
    case UPLOAD_KIND.IMAGE:
      rawContent = await extractImage(file, buffer);
      break;
    case UPLOAD_KIND.PDF:
      rawContent = await extractPdf(file, buffer, fileSizeBytes);
      break;
    case UPLOAD_KIND.WORD:
      rawContent = await extractWord(file, buffer);
      break;
    default:
      break;
  }

  rawContent = sanitizePetitionText(rawContent);
  if (isBlank(rawContent)) {
    throw new Error('Uploaded file contains no readable petition text.');
  }

  return rawContent;
};

module.exports = {
  extractPetitionTextFromUpload,
  assessTextQuality,
  detectUploadKind,
  inspectPdfBuffer,
  resolvePdfExtractionMode,
  EXTRACTION_CONFIG,
  UPLOAD_KIND
};
