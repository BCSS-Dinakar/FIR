# RAG Evaluation Dataset

## Files

| File | Purpose |
|------|---------|
| `rag_cases.json` | Hand-curated starter cases (8) — negative controls + clear offences |
| `rag_cases_expanded.json` | Generated via `npm run db:generate-eval-cases -- --target 250` |

## Generate expanded dataset

```bash
cd backend
npm run db:generate-eval-cases -- --target 250
npm run db:eval-rag -- --cases eval/rag_cases_expanded.json
```

The generator creates fact patterns from PostgreSQL `laws_sections` titles. **Do not use generated cases alone for RRF weight tuning** — supplement with officer-reviewed FIR cases.

## Ablation modes

| Mode | Retrieval paths |
|------|-----------------|
| A | BM25 |
| B | BM25 + FTS |
| C | BM25 + FTS + Trigram |
| D | BM25 + FTS + Trigram + Vector |

Critical comparison: **Mode C vs Mode D** at Recall@20/30.

## Reports

`npm run db:rag-report` writes JSON reports to `eval/reports/`.
