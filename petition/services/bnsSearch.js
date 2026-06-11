const { ChromaClient } = require('chromadb');
const { generateOllamaEmbedding } = require('../ollamaService');

const COLLECTION_NAME = 'bns_collection';
const client = new ChromaClient({ path: "http://localhost:8000" });

/**
 * Search ChromaDB for relevant BNS sections using one or two query strings.
 * A second optional contextQuery ensures relationship/motive sections (e.g. Section 85)
 * are also retrieved alongside the primary action-based results.
 *
 * @param {string} actionQuery  - Main incident description for ChromaDB search.
 * @param {string} contextQuery - Optional secondary query for relationship/motive context.
 * @returns {Array} [{section, title, content, distance}] merged unique results.
 */
async function searchBNS(actionQuery, contextQuery = null) {
    try {
        const collection = await client.getCollection({ name: COLLECTION_NAME });

        // Helper: embed a query and fetch results from ChromaDB
        const query = async (text, nResults) => {
            const embedding = await generateOllamaEmbedding(text);
            const res = await collection.query({
                queryEmbeddings: [embedding],
                nResults,
                include: ['metadatas', 'documents', 'distances']
            });
            const out = [];
            if (res.ids && res.ids[0]) {
                for (let i = 0; i < res.ids[0].length; i++) {
                    out.push({
                        section: res.metadatas[0][i].section,
                        title: res.metadatas[0][i].title,
                        content: (res.documents[0][i] || '').slice(0, 300),
                        distance: res.distances[0][i]
                    });
                }
            }
            return out;
        };

        // Run primary query
        const primary = await query(actionQuery, 15);

        // Run secondary query and merge unique results
        let merged = [...primary];
        if (contextQuery) {
            const secondary = await query(contextQuery, 10);
            const seen = new Set(primary.map(r => r.section));
            for (const r of secondary) {
                if (!seen.has(r.section)) {
                    merged.push(r);
                    seen.add(r.section);
                }
            }
        }

        // Sort by distance (lower = better)
        return merged.sort((a, b) => a.distance - b.distance);

    } catch (e) {
        console.error("Semantic search failed. Is ChromaDB running and populated?", e.message);
        return [];
    }
}

module.exports = searchBNS;
