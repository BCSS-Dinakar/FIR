const { generateText } = require('./aiService');
const {
  generateEmbedding,
  getEmbeddingModelId,
  EmbeddingNotConfiguredError
} = require('./embeddingService');
const bnsCatalogService = require('./bnsCatalogService');
const lawsRepo = require('../repositories/lawsRepo');
const lawEmbeddingsRepo = require('../repositories/lawEmbeddingsRepo');
const { searchLexical } = require('./bnsLexicalIndex');
const {
  sanitizePetitionText,
  isBlank,
  parseJsonFromLlm,
  normalizeRerankSections
} = require('../helpers/llmUtils');

const RETRIEVAL_TOP_K = 15;
const LEXICAL_TOP_M = 15;
const CONFIDENCE_THRESHOLD = 0.5;

const extractIncidentFacts = async (content) => {
  const petition = sanitizePetitionText(content, { maxChars: 24000 });
  if (isBlank(petition)) return '';

  const prompt = `TASK: Extract a dense factual paragraph for legal section retrieval. FACTS ONLY.

INCLUDE (only when present in the text):
- Conduct of the accused, step by step
- Legally material relationship (spouse, employer, stranger, etc.)
- Stated or evident intent/motive
- Threats (nature and target)
- Physical harm (severity, body part, weapon, medical outcome)
- Property (what, how taken/damaged/withheld)
- Deception or false representation
- Forged/falsified documents or signatures
- Unlawful entry or trespass
- Restraint or confinement
- Extortion or coercion
- Cyber/online conduct (platform, account, transaction) when stated
- Any other legally material fact

STRICT RULES:
- No names, addresses, dates, salutations, or section numbers.
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

const mergeCandidate = (map, code, patch) => {
  const existing = map.get(code) || {
    code,
    vectorScore: null,
    ftsScore: null,
    lexicalScore: null
  };
  map.set(code, { ...existing, ...patch, code });
};

/**
 * Hybrid retrieval: PostgreSQL FTS/trigram + optional pgvector + in-process BM25.
 * Does not use bnsEmbeddings.json at runtime.
 */
const retrieveCandidates = async (facts) => {
  const byCode = new Map();

  try {
    const ftsRows = await lawsRepo.searchLawsRag(facts, null, RETRIEVAL_TOP_K * 3);
    lawEmbeddingsRepo.dedupeFtsRowsToSections(ftsRows, RETRIEVAL_TOP_K).forEach((m) => {
      mergeCandidate(byCode, m.code, { ftsScore: m.score });
    });
  } catch (error) {
    console.warn('[bnsRagService] PostgreSQL FTS retrieval failed:', error.message);
  }

  const embeddingModel = getEmbeddingModelId();
  if (embeddingModel) {
    try {
      const stats = await lawEmbeddingsRepo.getEmbeddingStats(embeddingModel);
      if (stats.pgvector && stats.count > 0) {
        const queryEmbedding = await generateEmbedding(facts);
        const vectorMatches = await lawEmbeddingsRepo.searchSimilarSections(
          queryEmbedding,
          embeddingModel,
          RETRIEVAL_TOP_K
        );
        vectorMatches.forEach((m) => {
          mergeCandidate(byCode, m.code, { vectorScore: m.score });
        });
      }
    } catch (error) {
      if (!(error instanceof EmbeddingNotConfiguredError)) {
        console.warn('[bnsRagService] pgvector retrieval failed:', error.message);
      }
    }
  }

  const lexicalMatches = await searchLexical(facts, LEXICAL_TOP_M);
  lexicalMatches.forEach((m) => {
    mergeCandidate(byCode, m.code, { lexicalScore: m.score });
  });

  if (byCode.size === 0) {
    throw new Error(
      'No legal section candidates retrieved. Check PostgreSQL connectivity and search_laws_rag().'
    );
  }

  const merged = [...byCode.values()];
  const entries = await Promise.all(merged.map((m) => bnsCatalogService.getByCode(m.code)));
  return merged
    .map((m, i) => {
      if (!entries[i]) return null;
      return {
        ...entries[i],
        similarity: m.vectorScore ?? m.ftsScore ?? null,
        vectorScore: m.vectorScore,
        ftsScore: m.ftsScore,
        lexicalScore: m.lexicalScore
      };
    })
    .filter(Boolean);
};

const rerankSections = async (facts, candidates) => {
  if (!facts?.trim() || candidates.length === 0) return [];

  const candidatesForPrompt = candidates.map((c) => ({
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
  "sections": [
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
  const parsed = parseJsonFromLlm(response, { fallback: { sections: [] }, label: 'BNS reranker' });
  return normalizeRerankSections(parsed.sections);
};

const recommendSections = async (translatedContent) => {
  const facts = await extractIncidentFacts(translatedContent);
  if (!facts) return { facts: '', recommendations: [] };

  const candidates = await retrieveCandidates(facts);
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

  return { facts, recommendations };
};

module.exports = {
  extractIncidentFacts,
  retrieveCandidates,
  rerankSections,
  recommendSections,
  CONFIDENCE_THRESHOLD
};
