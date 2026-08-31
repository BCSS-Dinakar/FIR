const { generateText, generateEmbedding } = require('./aiService');
const bnsCatalogService = require('./bnsCatalogService');
const bnsVectorIndex = require('./bnsVectorIndex');
const { searchLexical } = require('./bnsLexicalIndex');

// Retrieval is hybrid: dense (embedding) + lexical (BM25), unioned before rerank.
// Dense search alone was measured putting the correct section at rank 142/1059 on
// a textbook cheating fact-pattern — statutory boilerplate is near-identical across
// sections, so cosine scores bunch up (0.78-0.83 across the whole catalog) and stop
// discriminating. BM25 put that same section at rank 13. Neither is reliable alone,
// so both feed the reranker, which supplies the precision.
const RETRIEVAL_TOP_K = 15;
const LEXICAL_TOP_M = 15;
// Reranker output below this confidence is dropped entirely (not shown anywhere).
// Sections at/above this but below AUTO_SELECT_THRESHOLD (see firPipeline.js) are
// still shown in Suggested Sections, just left unchecked for the officer to review.
// See backend/scripts/test_bns_rag.js for the representative-case sweep this value
// was picked from — it's the lowest value at which known-irrelevant probe cases
// still score at or below the gap separating them from the true-positive cases.
const CONFIDENCE_THRESHOLD = 0.5;

/**
 * step: Extract a focused legal-retrieval query from the translated petition text.
 * This intentionally asks for FACTS only (no legal conclusions), covering every
 * category that maps to a BNS chapter, so retrieval isn't limited to a vague summary.
 */
const extractIncidentFacts = async (content) => {
  const prompt = `You are a legal analyst preparing a factual query for a legal database search. Read the following FIR/petition and extract ONLY the factual allegations, as a dense paragraph, for the following categories WHERE PRESENT in the text:

- Acts committed / conduct of the accused (what they actually did, step by step)
- Relationship between accused and victim, where legally material (e.g. spouse, employer, stranger)
- Stated or evident intent or motive
- Threats made (nature of the threat, to whom)
- Physical harm caused (severity, body part, weapon/method, medical outcome if mentioned)
- Property involved (what property, how it was taken/damaged/withheld)
- Deception or false representation made to the victim
- Forged, falsified, or fabricated documents/signatures
- Unlawful entry into a house/property
- Physical restraint or confinement of a person
- Extortion or coercion for money/property/favour
- Any other legally material fact not covered above

CRITICAL RULES:
- Do NOT include names, addresses, dates, or salutations.
- Do NOT state legal conclusions (e.g. do not write "this is theft" or "this is assault") — describe only what happened in plain factual terms.
- Do NOT invent or infer facts that are not stated or clearly evident in the text.
- Omit any category with no supporting facts in the text — do not pad or guess.
- Return ONLY the factual paragraph. Nothing else.

PETITION:
${content}`;
  return await generateText(prompt, 500);
};

/**
 * step: Retrieve candidate sections (across BNS, BNSS, and BSA) using both dense
 * embedding similarity and BM25 keyword search, unioned. This stage optimizes for
 * RECALL — precision is handled by the legal-judge rerank step below, since no
 * similarity cutoff reliably separates "relevant" from "irrelevant" across ~1000
 * heterogeneous sections spanning three different kinds of law. A section the
 * reranker never sees can never be recommended, so it's better to over-supply here.
 */
const retrieveCandidates = async (facts) => {
  if (!bnsVectorIndex.isIndexAvailable()) {
    throw new Error('Legal section embeddings index missing. Run "node scripts/ingestBnsEmbeddings.js".');
  }

  const queryEmbedding = await generateEmbedding(facts);
  const denseMatches = bnsVectorIndex.searchSimilar(queryEmbedding, RETRIEVAL_TOP_K);
  const lexicalMatches = await searchLexical(facts, LEXICAL_TOP_M);

  // Union, keeping whichever signal found each section (both, where they agree).
  const byCode = new Map();
  denseMatches.forEach((m) => byCode.set(m.code, { code: m.code, similarity: m.score, lexicalScore: null }));
  lexicalMatches.forEach((m) => {
    const existing = byCode.get(m.code);
    if (existing) existing.lexicalScore = m.score;
    else byCode.set(m.code, { code: m.code, similarity: null, lexicalScore: m.score });
  });

  const merged = [...byCode.values()];
  const entries = await Promise.all(merged.map((m) => bnsCatalogService.getByCode(m.code)));
  return merged
    .map((m, i) => (entries[i] ? { ...entries[i], similarity: m.similarity, lexicalScore: m.lexicalScore } : null))
    .filter(Boolean);
};

/**
 * step: Legal-judge reranker. Given the incident facts and candidate sections'
 * ACTUAL statutory text (not just titles), decide which candidates are genuinely
 * supported by the facts. This is where false positives get filtered out — the
 * embedding stage only proposes candidates, it never gets to recommend on its own.
 */
const rerankSections = async (facts, candidates) => {
  if (candidates.length === 0) return [];

  const candidatesForPrompt = candidates.map((c) => ({
    code: c.code,
    law: c.law,
    title: c.title,
    law_text: c.fullText.slice(0, 1200)
  }));

  const prompt = `You are a legal AI assistant specialized in Indian criminal law section identification, covering three 2023 codes:
- BNS (Bharatiya Nyaya Sanhita) — substantive offences: what crime was committed.
- BNSS (Bharatiya Nagarik Suraksha Sanhita) — criminal procedure: arrest, search and seizure, summons, bail, investigation, cognizance.
- BSA (Bharatiya Sakshya Adhiniyam) — law of evidence: admissibility, dying declarations, confessions, documentary/electronic evidence, presumptions.

You are acting as a strict legal judge, not a search engine — your job is to REJECT weak matches, not to maximize how many sections you return.

Incident facts:
${facts}

Candidate sections from all three acts (retrieved by semantic search — treat as candidates only, not confirmed matches; each has a "law" field telling you which act it's from):
${JSON.stringify(candidatesForPrompt, null, 2)}

TASK: For each candidate, decide whether the incident facts satisfy the legal ingredients of that section's actual text above. Select ONLY sections that are legally supported.

GENERAL RULES:
1. Match the complete ingredients of the section as written in law_text, not just keyword overlap with the title.
2. A section qualifies only if ALL major required conditions in its text are present in the incident facts.
3. Reject a candidate outright if the facts share only vocabulary with it, not its legal elements.
4. Do not infer facts that are not stated. When in doubt, exclude the candidate.
5. It is correct and expected to return an empty array if no candidate is properly supported by the facts — do not force a match.
6. Return every candidate that is genuinely legally supported, ranked strongest first — do not artificially cap the count, and do not pad the list to reach any particular number.

RULES FOR BNS (substantive offence) CANDIDATES:
7. Do not select death-related or homicide sections unless death or attempt to cause death is clearly stated.
8. Do not select sexual-offence or modesty sections unless a sexual act or an act with clear intent to outrage modesty is explicitly stated (an argument, a slap, or a beating during a dispute is NOT a modesty offence).
9. Do not select dowry-related or cruelty-by-relative sections unless a dowry demand or marital cruelty is explicitly stated.
10. Do not select forgery/fabrication sections unless a forged, falsified, or counterfeited document/signature/property is explicitly stated.
11. Do not select cheating/fraud sections merely because money, loss, or property is mentioned — deception or dishonest inducement must be explicitly stated.
12. Do not select theft sections merely because property is mentioned — an unauthorized taking must be explicitly stated.
13. Do not select assault/hurt sections from the mere existence of an argument or dispute — physical contact, force, or a credible threat of force must be explicitly stated.
14. Do not select provocation-mitigation sections unless the accused was provoked by sudden and grave provocation from the victim immediately before the act.
15. If the victim is alive and is the complainant, never select a death/dowry-death/homicide section.

RULES FOR BNSS (procedure) AND BSA (evidence) CANDIDATES — apply extra caution here:
16. A BNSS or BSA section describes a PROCEDURE or an EVIDENTIARY RULE, not a crime — it is almost never one of the "applied sections" of an FIR, which normally lists only the offence (BNS) sections.
17. Select a BNSS section ONLY if the facts explicitly narrate the specific procedural act that section governs already having happened or being directly at issue (e.g. facts state the accused was arrested without a warrant, a specific search/seizure occurred, a particular statement/confession was recorded) — never merely because "police", "FIR", "investigation", or "arrest" are mentioned in a generic sense.
18. Select a BSA section ONLY if the facts explicitly narrate the specific evidentiary event that section governs (e.g. a dying declaration was made, a confession was recorded, specific documentary or electronic evidence is described, an expert examined something) — never merely because "evidence" or "proof" is mentioned generically.
19. If in doubt between selecting a BNSS/BSA section or leaving it out, leave it out — a missed procedural citation is a minor omission; a wrongly "applied" procedural section on an FIR is a real error.
20. Expect most petitions to yield ONLY BNS sections. BNSS/BSA sections should be rare and only when rule 17 or 18's specific-event bar is clearly met.

For every selected section, give a confidence score from 0.0 to 1.0 reflecting how completely the facts satisfy that section's legal ingredients (1.0 = every element clearly present; 0.5 = plausible but missing an element; below 0.5 should not be selected at all), and quote/paraphrase the SPECIFIC facts (already present above — do not invent new ones) that support the match.

Return ONLY JSON, no markdown, no explanation outside JSON, in this exact format:
{
  "sections": [
    { "code": "BNS 115", "law": "BNS", "title": "Voluntarily causing hurt", "confidence": 0.9, "matchedFacts": ["the accused slapped the complainant"], "reason": "short legal reasoning" }
  ]
}`;

  const response = await generateText(prompt, 1200);
  let parsed;
  try {
    parsed = JSON.parse(response);
  } catch (e) {
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Failed to parse BNS reranker response.');
    parsed = JSON.parse(match[0]);
  }
  return Array.isArray(parsed.sections) ? parsed.sections : [];
};

/**
 * Full pipeline: facts -> candidates -> legal-judge rerank -> confidence-thresholded
 * recommendations. Returns [] (never fabricated sections) if nothing clears the bar.
 * @param {string} translatedContent - English-translated petition text.
 * @returns {Promise<Array<{code, title, confidence, matchedFacts, reason}>>}
 */
const recommendSections = async (translatedContent) => {
  const facts = await extractIncidentFacts(translatedContent);
  if (!facts || !facts.trim()) return { facts: '', recommendations: [] };

  const candidates = await retrieveCandidates(facts);
  const reranked = await rerankSections(facts, candidates);

  const aboveThreshold = reranked.filter((r) => typeof r.confidence === 'number' && r.confidence >= CONFIDENCE_THRESHOLD);
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
      matchedFacts: Array.isArray(r.matchedFacts) ? r.matchedFacts : [],
      reason: r.reason || ''
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
