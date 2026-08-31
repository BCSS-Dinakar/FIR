/**
 * Local, non-AI extraction of complainant details from the petition salutation
 * line. Handles two forms of the same information, because Petition.step2Output
 * is a TRANSLATED/paraphrased petition, not the raw original — the translation
 * step naturally renders the standard legal abbreviations as prose:
 *   Abbreviated: "I, Mustafa Ahmed Khan S/o Rasheed Akbar Khan, Age: 60 years,
 *                 Occupation: Private Employee, Ph.No. 9700966617, R/o H.No.
 *                 11-1-1204/1/87, Mallepally, Hyderabad, respectfully submit..."
 *   Prose (translated): "I, Mustafa Ahmed Khan, son of Rasheed Akbar Khan, aged
 *                 60 years, occupation: Private Employee, mobile no. 9700966617,
 *                 resident of H.No. 11-1-1204/1/87, Mallepally, Hyderabad,
 *                 respectfully submit..."
 * Both must be matched — relying on only the abbreviated form silently misses
 * every translated petition, which is the normal case in this pipeline.
 *
 * Pure pattern-matching, no API calls. Deliberately conservative: a field that
 * doesn't match a recognized pattern comes back null rather than guessed — a
 * regex miss is a safe failure (field stays blank for the officer to fill in),
 * but a regex over-match on freeform narrative text risks silently inserting
 * wrong data into a legal document, which is worse than leaving it blank.
 *
 * This intentionally does NOT attempt to extract "place of occurrence",
 * "properties stolen", or occurrence date/time — these require disambiguating
 * between multiple candidates a narrative can mention (e.g. a petition
 * describing two separate incident dates, or several places), which is reading
 * comprehension a pattern can't safely do; a wrong date/place on an FIR is a
 * worse outcome than a blank field the officer fills in after reading the
 * complaint (see FIRDocument.js for where these are deliberately left blank).
 */

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().replace(/[,.]$/, '');

// Where relative/occupation extraction stops: the next comma, or a following
// field label (works whether that label is itself abbreviated or prose).
const FIELD_STOP = /(?=,|\s+(?:Age|Aged)\b|\s+Occupation\b|\s+(?:occupation|working)\b|\s+R\/o\b|\s+resident\b|\s+residing\b|$)/i;

/**
 * S/o, D/o, W/o <name>  OR  "son of"/"daughter of"/"wife of"/"husband of" <name>
 * (the prose form a translation step commonly produces for the same relation).
 */
const extractRelative = (text) => {
  const abbreviated = text.match(new RegExp(`\\b[SDW]\\/o\\.?\\s+([A-Z][A-Za-z.\\s]*?)${FIELD_STOP.source}`));
  if (abbreviated) return clean(abbreviated[1]);
  const prose = text.match(new RegExp(`\\b(?:son|daughter|wife|husband)\\s+of\\s+([A-Z][A-Za-z.\\s]*?)${FIELD_STOP.source}`, 'i'));
  return prose ? clean(prose[1]) : null;
};

/** "Age: 60 years" / "Aged about 60 years" / "Age 60" */
const extractAge = (text) => {
  const match = text.match(/\bAge[d]?\s*:?\s*(?:about\s+)?(\d{1,3})\s*(?:years?|yrs?)?\b/i);
  return match ? match[1] : null;
};

/** "Occupation: Private Employee" — stops at the next known field label. */
const extractOccupation = (text) => {
  const labeled = text.match(/\bOccupation\s*:?\s*([A-Za-z][A-Za-z\s]*?)(?=,|\s+Ph\.?\s*No\b|\s+Phone\b|\s+Mobile\b|\s+R\/o\b|$)/i);
  if (labeled) return clean(labeled[1]);
  const workingAs = text.match(/\bworking\s+as\s+(?:an?\s+)?([A-Za-z][A-Za-z\s]*?)(?:,|\.|\band\b|$)/i);
  return workingAs ? clean(workingAs[1]) : null;
};

/** "Ph.No. 9700966617" / "Phone: ..." / "Mobile: ..." — falls back to a bare 10-digit number. */
const extractMobile = (text) => {
  const labeled = text.match(/\b(?:Ph\.?\s*No\.?|Phone|Mobile)\s*:?\s*(\d{7,15})\b/i);
  if (labeled) return labeled[1];
  const bare = text.match(/\b(\d{10})\b/);
  return bare ? bare[1] : null;
};

// Address runs until a known sentence-closing phrase, a redundant restatement of
// another field, a newline, or end of text — deliberately NOT a bare "next period",
// since addresses routinely contain abbreviation periods (e.g. "H.No.", "Rd.",
// "Dist.") that would truncate early. ". I " catches the very common pattern of the
// next sentence restarting in first person ("...Hyderabad. I hereby submit...").
const ADDRESS_STOP = /(?:,?\s*(?:most\s+)?(?:respectfully|humbly)\s+submit|\.\s+I\b|,?\s*(?:Mobile|Phone|Ph\.?\s*No\.?)\s*:?\s*\d|\n|$)/i;

/**
 * "R/o <address>" (abbreviated) OR "residing at <address>" / "resident of
 * <address>" (the prose a translation step commonly produces for the same thing)
 * — runs until a real sentence closer.
 */
const extractAddress = (text) => {
  const abbreviated = text.match(new RegExp(`\\bR\\/o\\.?\\s*(.+?)${ADDRESS_STOP.source}`, 'i'));
  if (abbreviated) return clean(abbreviated[1]);
  const prose = text.match(new RegExp(`\\bresid(?:ing\\s+at|ent\\s+of)\\s+(.+?)${ADDRESS_STOP.source}`, 'i'));
  return prose ? clean(prose[1]) : null;
};

/**
 * @param {string} text - Translated petition text (e.g. Petition.step2Output).
 * @returns {{relative: string|null, age: string|null, occupation: string|null, mobile: string|null, address: string|null}}
 */
const parseComplainantDetails = (text) => {
  const source = text || '';
  return {
    relative: extractRelative(source),
    age: extractAge(source),
    occupation: extractOccupation(source),
    mobile: extractMobile(source),
    address: extractAddress(source)
  };
};

export { parseComplainantDetails };
