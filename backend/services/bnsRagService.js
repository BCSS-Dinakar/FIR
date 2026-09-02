const { generateText } = require('./aiService');
const bnsCatalogService = require('./bnsCatalogService');
const { retrieveHybridCandidates } = require('./ragRetrievalService');
const config = require('./ragRetrievalConfig');
const {
  sanitizePetitionText,
  isBlank,
  parseJsonFromLlm,
  normalizeRerankSections
} = require('../helpers/llmUtils');

const CONFIDENCE_THRESHOLD = 0.5;
const RETRIEVAL_FALLBACK_CONFIDENCE = 0.55;
const DISPLAY_FALLBACK_COUNT = parseInt(process.env.RAG_DISPLAY_FALLBACK_COUNT || '3', 10);

const extractIncidentFacts = async (content) => {
  const petition = sanitizePetitionText(content, { maxChars: 24000 });
  if (isBlank(petition)) return '';

  const prompt = `TASK: Extract a dense factual paragraph for legal section retrieval. FACTS ONLY.

INCLUDE (only when present in the text):
- Conduct of the accused, step by step
- Legally material acts committed
- Property (what, how taken/damaged/withheld)
- Deception, false representation, or inducement
- Threats (nature and target) and force used
- Physical harm (severity, body part, weapon, medical outcome) and death when stated
- Relationship between parties when legally material
- Method and relevant circumstances
- Explicit intent or motive when stated
- Forged/falsified documents, unlawful entry, restraint, extortion, cyber conduct when stated

STRICT RULES:
- No names, addresses, dates, salutations, police-station boilerplate, or section numbers.
- No legal conclusions ("this is theft", "assault", etc.).
- No invented or inferred facts.
- Omit empty categories — do not pad.
- If the petition is vague, extract only what is explicitly stated.
- Output ONE paragraph only. No bullets, no JSON, no headings.

PETITION:
${petition}`;

  const facts = await generateText(prompt, 600, { mode: 'plain' });
  return sanitizePetitionText(facts, { maxChars: 4000 });
};

const attachCatalogEntries = async (retrievalCandidates) => {
  const entries = await Promise.all(
    retrievalCandidates.map((candidate) => bnsCatalogService.getByCode(candidate.code))
  );

  return retrievalCandidates
    .map((candidate, index) => {
      const entry = entries[index];
      if (!entry) return null;
      return {
        ...entry,
        similarity: candidate.semanticScore ?? candidate.ftsScore ?? candidate.bm25Score ?? null,
        vectorScore: candidate.semanticScore,
        ftsScore: candidate.ftsScore,
        lexicalScore: candidate.bm25Score,
        trigramScore: candidate.trigramScore,
        bm25Score: candidate.bm25Score,
        semanticScore: candidate.semanticScore,
        rrfScore: candidate.rrfScore,
        retrievalMeta: {
          bm25Rank: candidate.bm25Rank,
          ftsRank: candidate.ftsRank,
          trigramRank: candidate.trigramRank,
          semanticRank: candidate.semanticRank,
          sources: candidate.sources,
          matchedChunks: candidate.matchedChunks
        }
      };
    })
    .filter(Boolean);
};

/**
 * Hybrid RAG retrieval: independent lexical (BM25 + FTS + trigram) + semantic paths,
 * union, dedupe, RRF fusion, then top-K candidates for the legal judge.
 */
const retrieveCandidates = async (facts, options = {}) => {
  const { candidates, stats } = await retrieveHybridCandidates(facts, options);
  const enriched = await attachCatalogEntries(candidates);
  enriched.retrievalStats = stats;
  return enriched;
};

const rerankSections = async (facts, candidates) => {
  if (!facts?.trim() || candidates.length === 0) return [];

  const judgeLimit = config.FINAL_CANDIDATE_LIMIT;
  const forJudge = candidates.slice(0, judgeLimit);

  const candidatesForPrompt = forJudge.map((c) => ({
    code: c.code,
    law: c.law,
    title: c.title,
    law_text: c.fullText.slice(0, 1200)
  }));

  const prompt = `TASK: Act as a strict legal judge. Select ONLY candidate sections whose statutory ingredients are satisfied by the incident facts.

CODES:
- BNS — substantive offences (usual FIR "applied sections")
- BNSS — criminal procedure (rare; only if facts narrate a specific procedural event)
- BSA — evidence rules (rare; only if facts narrate a specific evidentiary event)

INCIDENT FACTS:
${facts}

CANDIDATES (retrieval only — not confirmed matches):
${JSON.stringify(candidatesForPrompt)}

REJECTION RULES (edge cases):
- Keyword overlap alone is NOT enough — all major legal elements must match.
- Never invent facts. Use only the incident facts above.
- No death/homicide sections unless death or attempt to cause death is stated.
- No sexual/modesty sections unless explicitly stated.
- No dowry/cruelty sections unless explicitly stated.
- No forgery sections unless forged document/signature is stated.
- No cheating without deception/dishonest inducement stated.
- No theft without unauthorized taking stated.
- No hurt/assault from argument alone — force or credible threat required.
- Living victim/complainant → never homicide/dowry-death sections.
- BNSS/BSA only when the specific governed event is explicitly narrated.
- When uncertain, EXCLUDE. Empty array is valid.

For each selected section provide confidence 0.0–1.0 (exclude below 0.5).

Return ONLY JSON:
{
  "recommendations": [
    {
      "code": "BNS 115",
      "law": "BNS",
      "title": "Voluntarily causing hurt",
      "confidence": 0.9,
      "matchedFacts": ["fact from text"],
      "reason": "short legal reasoning"
    }
  ]
}`;

  const response = await generateText(prompt, 1400, { mode: 'json', jsonMode: true });
  const parsed = parseJsonFromLlm(response, { fallback: { recommendations: [] }, label: 'BNS reranker' });
  const sections = parsed.recommendations || parsed.sections || [];
  const normalized = normalizeRerankSections(sections);
  if (!sections.length) {
    console.log('[bnsRagService] judge returned empty recommendations (strict rejection)');
  } else if (!normalized.length) {
    console.log(
      `[bnsRagService] judge returned ${sections.length} section(s) but none passed confidence >= ${CONFIDENCE_THRESHOLD}`
    );
  }
  return normalized;
};

const recommendSections = async (translatedContent) => {
  const facts = await extractIncidentFacts(translatedContent);
  if (!facts) return { facts: '', recommendations: [], retrievalStats: null };

  const candidates = await retrieveCandidates(facts);
  const retrievalStats = candidates.retrievalStats || null;
  const reranked = await rerankSections(facts, candidates);

  const aboveThreshold = reranked.filter((r) => r.confidence >= CONFIDENCE_THRESHOLD);
  const entries = await Promise.all(aboveThreshold.map((r) => bnsCatalogService.getByCode(r.code)));

  const recommendations = aboveThreshold
    .map((r, i) => (entries[i] ? { r, entry: entries[i] } : null))
    .filter(Boolean)
    .map(({ r, entry }) => ({
      code: entry.code,
      law: entry.law,
      act: entry.act,
      title: entry.title,
      confidence: r.confidence,
      matchedFacts: r.matchedFacts,
      reason: r.reason
    }));

  if (retrievalStats) {
    console.log(
      `[bnsRagService] judge accepted ${recommendations.length}/${candidates.length} candidates ` +
        `(threshold=${CONFIDENCE_THRESHOLD})`
    );
  }

  if (recommendations.length === 0 && candidates.length > 0) {
    const fallback = candidates.slice(0, DISPLAY_FALLBACK_COUNT).map((entry) => ({
      code: entry.code,
      law: entry.law,
      act: entry.act,
      title: entry.title,
      confidence: RETRIEVAL_FALLBACK_CONFIDENCE,
      matchedFacts: [],
      reason: 'Hybrid retrieval candidate (Qwen judge did not confirm any section)',
      retrievalFallback: true
    }));
    console.log(
      `[bnsRagService] retrieval fallback (${fallback.length}): ${fallback.map((r) => r.code).join(', ')}`
    );
    return { facts, recommendations: fallback, retrievalStats, judgeConfirmed: false };
  }

  return { facts, recommendations, retrievalStats, judgeConfirmed: true };
};

module.exports = {
  extractIncidentFacts,
  retrieveCandidates,
  rerankSections,
  recommendSections,
  CONFIDENCE_THRESHOLD
};
