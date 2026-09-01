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
 * PDFs: embedded text layer when trustworthy; otherwise OCR; picks best result.
 *
 * Tune via env (all optional):
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

const EXTRACTION_CONFIG = {
  minChars: readIntEnv('DOCUMENT_MIN_CHARS', 150),
  minCharsPerPage: readIntEnv('DOCUMENT_MIN_CHARS_PER_PAGE', 80),
  minWords: readIntEnv('DOCUMENT_MIN_WORDS', 20),
  minAlnumRatio: readFloatEnv('DOCUMENT_MIN_ALNUM_RATIO', 0.25),
  scanMinFileBytes: readIntEnv('DOCUMENT_SCAN_MIN_FILE_BYTES', 50_000),
  scanSuspiciousBytesPerChar: readIntEnv('DOCUMENT_SCAN_SUSPICIOUS_BYTES_PER_CHAR', 400),
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

const pickBestCandidate = (candidates) => {
  const ranked = candidates
    .map((c) => ({ ...c, quality: assessTextQuality(c.text, c.context) }))
    .filter((c) => !isBlank(c.text))
    .sort((a, b) => b.quality.score - a.quality.score || b.text.length - a.text.length);

  return ranked[0] || null;
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
  const candidates = [];

  let embedded = { text: '', pageCount: 1 };
  let embeddedError = null;
  try {
    embedded = await extractPdfEmbedded(file.path);
    if (!isBlank(embedded.text)) {
      candidates.push({
        text: embedded.text,
        source: 'pdf-embedded',
        context: { pageCount: embedded.pageCount, fileSizeBytes }
      });
    }
  } catch (err) {
    embeddedError = err;
  }

  const embeddedQuality = assessTextQuality(embedded.text, {
    pageCount: embedded.pageCount,
    fileSizeBytes
  });

  const needsOcr =
    Boolean(embeddedError)
    || !embeddedQuality.sufficient
    || candidates.length === 0;

  if (needsOcr) {
    const reason = embeddedError
      ? `parse failed (${embeddedError.message})`
      : embeddedQuality.reasons.join(', ') || 'low quality embedded text';
    console.log(`[Document Extract] PDF ${reason}; running OCR...`);

    try {
      const ocrText = await extractViaOcrGateway(file.path, mimeType, filename);
      candidates.push({
        text: sanitizePetitionText(ocrText),
        source: 'pdf-ocr',
        context: { pageCount: embedded.pageCount, fileSizeBytes }
      });
    } catch (err) {
      if (err instanceof OcrNotConfiguredError) throw err;
      if (candidates.length === 0) {
        throw new Error(`PDF OCR failed: ${err.message}`);
      }
      console.warn(`[Document Extract] PDF OCR failed, using embedded text: ${err.message}`);
    }
  }

  const best = pickBestCandidate(candidates);
  if (!best) {
    throw new Error('No text could be extracted from this PDF. Try a clearer scan or a text-based export.');
  }

  console.log(
    `[Document Extract] PDF via ${best.source} — ${best.quality.charCount} chars, ` +
      `score=${best.quality.score}${best.quality.reasons.length ? ` (${best.quality.reasons.join('; ')})` : ''}`
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
  EXTRACTION_CONFIG,
  UPLOAD_KIND
};
