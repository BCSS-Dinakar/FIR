/**
 * Resolve BNS/BNSS/BSA section labels for API responses and UI tables.
 * Petition.sections may be empty while sectionRecommendations or linked FIR sections exist.
 */

const formatSectionLabel = (entry) => {
  if (typeof entry === 'string') return entry.trim();
  if (!entry || typeof entry !== 'object') return '';
  const code = String(entry.code || '').trim();
  const title = String(entry.title || '').trim();
  if (!code) return title;
  return title ? `${code} (${title})` : code;
};

/**
 * @param {object} petition - repo row with sections + sectionRecommendations
 * @param {{ firSections?: string[] }} [options]
 * @returns {string[]}
 */
const resolvePetitionDisplaySections = (petition, { firSections = null } = {}) => {
  const stored = Array.isArray(petition?.sections)
    ? petition.sections.map((s) => String(s).trim()).filter(Boolean)
    : [];
  if (stored.length) return stored;

  const recs = Array.isArray(petition?.sectionRecommendations)
    ? petition.sectionRecommendations
    : [];
  if (recs.length) {
    return recs
      .map(formatSectionLabel)
      .filter(Boolean)
      .slice(0, 5);
  }

  const fromFir = Array.isArray(firSections)
    ? firSections.map((s) => String(s).trim()).filter(Boolean)
    : [];
  return fromFir;
};

module.exports = {
  formatSectionLabel,
  resolvePetitionDisplaySections
};
