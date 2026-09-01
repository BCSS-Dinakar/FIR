# MongoDB → PostgreSQL Migration Design

**Date:** 2026-09-01  
**Status:** Approved for implementation planning  
**Approach:** Repository layer + thin dual-write orchestration (Approach A)  
**Database:** PostgreSQL `legislative` @ `103.211.36.242:5432`

---

## 1. Goal

Migrate the FIR application from MongoDB to the existing PostgreSQL database `legislative`, covering:

1. **Legal corpus** — already normalized in Postgres; stop reading Mongo `legal_database.laws_sections` as primary.
2. **Application data** — `users`, `petitions`, `firs` created in the same DB if missing.

During transition: **PostgreSQL is authoritative**. MongoDB is a temporary compatibility layer (app sync + read fallback only). `fir-audit` API contracts remain unchanged.

---

## 2. Non-negotiable invariants

1. **PostgreSQL is authoritative** throughout Phases A–D.
2. MongoDB fallback is **read-only from the application’s perspective**; a fallback read **must not** automatically backfill PostgreSQL.
3. Mongo sync failures must be **observable and replayable** from the PostgreSQL row.
4. `migration_sync_status.postgres_id` is **nullable** for migration/orphan failures.
5. Migration identity matching is strictly **`mongo_id`**, then **`legacy_id` for petitions when necessary**; **never merge** on email, badge, or FIR number.
6. Legal data is **PG-canonical** and **excluded** from app dual-write / sync tracking.
7. **`fir-audit` API contracts remain unchanged.**
8. Phase E (Mongo removal) happens only after the migration report confirms **zero required Mongo fallback dependencies**.
9. MongoDB must **never overwrite** PostgreSQL state.

---

## 3. Scope map

### In scope

| Area | Action |
|------|--------|
| Backend Node app data | Repositories + dual-write for User / Petition / FIR |
| Backend legal catalog | `bnsCatalogService` → Postgres `laws_*` / `search_laws_rag` |
| `legalsections` Python RAG | Postgres primary; `search_laws_rag` / relational reads |
| DDL | Create `users`, `petitions`, `firs`, `migration_sync_status` if missing |
| Data migration | Idempotent Mongo → PG for app entities |
| Legal validation | Assert existing `laws_*` + RAG helpers; do not recreate |

### Out of scope

- Recreating or duplicating `laws_*` tables, `v_laws_rag_chunks`, or `search_laws_rag`
- Automatic Mongo→PG backfill on read fallback
- Frontend (`fir-audit`) schema/API changes
- Immediate removal of Mongo (Phase E is later)
- Replacing Node hybrid BNS dense+BM25 RAG with FTS-only in the first cut (catalog source moves to PG; retrieval stack stays)

---

## 4. Architecture

```text
                         fir-audit
                            │
                            ▼
                         backend
                            │
                 ┌──────────┴──────────┐
                 │                     │
                 ▼                     ▼
          PostgreSQL               MongoDB
          legislative             temporary
          PRIMARY                  fallback
                 │                     │
        ┌────────┴───────┐             │
        │                │             │
   App data          Legal data        │
        │                │             │
 users/petitions/    laws_*             │
 firs               RAG helpers        │
        │                │             │
        └──── PG authoritative ────────┘
```

### Dual-write (app data only)

```text
Write:  PG COMMIT → best-effort Mongo sync → sync_status synced|failed
Read:   PG first → on miss/unavailable + MONGO_FALLBACK → Mongo return (no auto-backfill)
```

### Legal corpus

```text
PostgreSQL primary/canonical
MongoDB legacy read fallback only (if required)
No dual-write of legal data back to MongoDB
```

---

## 5. Table inventory

### Legal (use existing; do not recreate)

| Table / object | Role |
|----------------|------|
| `laws_sections` | Section header + RAG columns |
| `law_subsections` | Child of sections |
| `law_clauses` | Under section or subsection |
| `law_subclauses` | Child of clauses |
| `law_explanations` | Section annotations |
| `law_illustrations` | Section annotations |
| `law_provisos` | Section annotations |
| `v_laws_rag_chunks` | Flat RAG chunks view |
| `search_laws_rag(query, law_filter, limit)` | Hybrid FTS + trigram |

Important `laws_sections` columns: `mongo_id`, `law_name`, `section_number`, `section_title`, `chapter`, `chapter_title`, `section_text`, `lead_text`, `punishment`, `section_sort`, `section_suffix`, `search_tsv`.  
Uniques: `(law_name, section_number)`, `mongo_id`. Child FKs: `ON DELETE CASCADE`.

### Application (create if missing)

| Table | Role |
|-------|------|
| `users` | Officers / auth |
| `petitions` | Petition audits |
| `firs` | Filed FIRs |
| `migration_sync_status` | Dual-write / migration observability |

### Relationships

```text
users.id (UUID PK)
   └──► petitions.user_id (UUID FK, nullable)
             └──► firs.petition_id (UUID FK → petitions.id, UNIQUE, ON DELETE RESTRICT)
```

Business/API string IDs (e.g. `PET-2026-…`) live in `petitions.legacy_id`, **not** as relational FKs.  
Reconciliation: `users.mongo_id`, `petitions.mongo_id`, `firs.mongo_id` (each `UNIQUE`).

Mongo collections found today: Mongoose `User`, `Petition`, `FIR`, plus raw collection `legal_database.laws_sections`. No other app collections.

---

## 6. Application DDL

Conventions:

- PK: `UUID DEFAULT gen_random_uuid()` (requires `pgcrypto`)
- Arrays / Mixed → `JSONB NOT NULL` with explicit `'[]'::jsonb` / `'{}'::jsonb` defaults
- Date/time display fields remain `TEXT` for cutover; **post-cutover normalization candidates**
- Create-if-missing; extend existing rather than duplicate

### `users`

| Column | Type |
|--------|------|
| `id` | UUID PK |
| `mongo_id` | TEXT UNIQUE |
| `name` | TEXT NOT NULL |
| `badge` | TEXT NOT NULL UNIQUE\* |
| `email` | TEXT NOT NULL UNIQUE\* |
| `mobile` | TEXT NOT NULL |
| `station` | TEXT NOT NULL |
| `password_hash` | TEXT NOT NULL |
| `rank` | TEXT NOT NULL DEFAULT `'Inspector'` |
| `state` | TEXT NOT NULL DEFAULT `'Telangana'` |
| `district` | TEXT NOT NULL DEFAULT `'Hyderabad'` |
| `theme_mode_ui` | TEXT NOT NULL DEFAULT `'dark'` |
| `sidebar_collapse` | BOOLEAN NOT NULL DEFAULT false |
| `last_login` | TIMESTAMPTZ |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |

\*Unique constraints for `badge`/`email` are expected (match Mongoose), but migration must **validate collisions first** and stop/report — never silent merge.

### `petitions`

| Column | Type |
|--------|------|
| `id` | UUID PK |
| `mongo_id` | TEXT UNIQUE |
| `legacy_id` | TEXT NOT NULL UNIQUE |
| `petition_no` | TEXT NOT NULL (UNIQUE **conditional** after validation) |
| `user_id` | UUID NULL → `users(id)` ON DELETE SET NULL |
| `date` | TEXT NOT NULL |
| `complainant` / `accused` | TEXT NOT NULL DEFAULT `'Unknown'` |
| `sections` | JSONB NOT NULL DEFAULT `'[]'::jsonb` |
| `section_recommendations` | JSONB NOT NULL DEFAULT `'[]'::jsonb` |
| `score` | INTEGER NOT NULL |
| `status` | TEXT NOT NULL DEFAULT `'Pending Filing'` |
| `blockers` | JSONB NOT NULL DEFAULT `'[]'::jsonb` |
| `source_file` | TEXT NOT NULL |
| `step1_output` / `step2_output` | TEXT NOT NULL DEFAULT `''` |
| `step3_output` | JSONB NOT NULL DEFAULT `'{}'::jsonb` |
| `metadata` | JSONB NOT NULL DEFAULT `'{}'::jsonb` |
| `fir_no` | TEXT NOT NULL DEFAULT `''` |
| `filed_at` | TEXT NOT NULL DEFAULT `''` |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() |

API list endpoints currently `select` fields (`district`, `policeStation`, `gdNumber`, …) that are **not** on the Mongoose Petition schema — map from `metadata` and/or joined FIR in the repository mapper; do not invent phantom columns without writers.

### `firs`

Full Mongoose → Postgres map (snake_case SQL; camelCase at API boundary):

| Mongoose | Postgres | Notes |
|----------|----------|-------|
| `_id` | `mongo_id` | TEXT UNIQUE |
| — | `id` | UUID PK |
| `firNo` | `fir_no` | TEXT NOT NULL; UNIQUE **conditional** |
| `petitionId` (string) | `petition_id` | UUID NOT NULL **UNIQUE** FK → `petitions(id)` ON DELETE RESTRICT |
| registration / occurrence / complainant / action fields | matching snake_case TEXT columns | defaults `''` (or `'Written'` / `'India'` / `'1'` as in schema) |
| `sections` | `sections` | JSONB NOT NULL DEFAULT `'[]'` |
| `accusedList` | `accused_list` | JSONB NOT NULL DEFAULT `'[]'` |
| `filedAt` | `filed_at` | **TEXT NOT NULL DEFAULT `''`** (not bare NOT NULL) |
| timestamps | `created_at` / `updated_at` | TIMESTAMPTZ |

Conditional uniqueness for `fir_no`: prefer global UNIQUE if validated; if collisions, use `UNIQUE (police_station, year, fir_no)`.

### `migration_sync_status`

| Column | Type |
|--------|------|
| `id` | UUID PK |
| `entity_type` | TEXT NOT NULL (`users` \| `petitions` \| `firs`) |
| `postgres_id` | **UUID NULL** |
| `mongo_id` | TEXT |
| `sync_direction` | TEXT NOT NULL (`mongo_to_pg` \| `pg_to_mongo`) |
| `sync_status` | TEXT NOT NULL (`synced` \| `pending` \| `failed`) |
| `last_synced_at` | TIMESTAMPTZ |
| `last_error` | TEXT |
| UNIQUE | `(entity_type, postgres_id, sync_direction)` where applicable |

Legal corpus rows are **not** tracked here.

DDL preamble: `CREATE EXTENSION IF NOT EXISTS pgcrypto;` — verify DB user can create extensions before running.

---

## 7. Code architecture (Approach A)

### Layout

```text
backend/
├── config/
│   ├── db.js                 # Mongo retain for sync/fallback
│   └── postgres.js           # pg Pool (POSTGRES_*)
├── adapters/
│   └── mongo/
│       ├── usersMongo.js
│       ├── petitionsMongo.js
│       └── firsMongo.js
├── repositories/
│   ├── dualWrite.js          # orchestration + sync_status only
│   ├── usersRepo.js
│   ├── petitionsRepo.js
│   ├── firsRepo.js
│   └── lawsRepo.js           # read-only laws_* + search_laws_rag
├── db/
│   ├── migrations/
│   │   ├── 001_app_tables.sql
│   │   └── 002_conditional_uniques.sql
│   └── migrate/
│       ├── validateUniques.js
│       ├── migrateUsers.js
│       ├── migratePetitions.js
│       ├── migrateFirs.js
│       ├── validateLegal.js
│       ├── migrateReport.js
│       └── replayFailedMongoSync.js
└── services/
    └── bnsCatalogService.js  # internals → lawsRepo; same public exports
```

```text
legalsections/app/
├── config.py      # POSTGRES_* + MONGO_* fallback
├── database.py    # PG primary; find_section / load from laws_*
└── rag/
    ├── retrieval.py   # prefer search_laws_rag
    └── embedding.py   # FAISS rebuild from PG if still used
```

Dependencies: Node `pg`; Python `psycopg[binary]` (or equivalent).

### Repository vs dualWrite vs adapters

- Each `*Repo` owns PostgreSQL CRUD and mapper (snake ↔ camel).
- Each `adapters/mongo/*` owns Mongo document shape.
- `dualWrite.js` owns: write/read orchestration, flags, `migration_sync_status` updates, logging. It does **not** know Petition/FIR Mongo field layouts.

### Call-site map

| Current | Becomes |
|---------|---------|
| `routes/auth.js`, `middleware/auth.js` → `User` | `usersRepo` |
| `routes/petition.js` → Petition/FIR/User | repos |
| `routes/fir.js` → FIR | `firsRepo` |
| `scripts/seed.js`, `cleanup.js` | dual-write aware |
| `bnsCatalogService` Mongo collection | `lawsRepo` |
| `bnsLexicalIndex` / embeddings ingest | still via catalog API (PG-backed) |
| `bnsRagService` hybrid dense+BM25 | **keep**; catalog text from PG |
| `legalsections` Mongo | PG + `search_laws_rag` |

### JWT identity

```text
JWT id
 ├── valid UUID → users.id
 └── otherwise → users.mongo_id / Mongo adapter fallback
```

Do not interpret an arbitrary string as both ID types.

### Env flags

```text
POSTGRES_HOST / POSTGRES_PORT / POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD
PG_PRIMARY=true
MONGO_SYNC=true          # app dual-write only
MONGO_FALLBACK=true      # app (+ optional legal read-only fallback)
MONGO_URI=...            # until Phase E
```

---

## 8. Data migration

### Order

```text
0. Validate existing laws_* (+ search_laws_rag smoke)
1. Apply 001_app_tables.sql (create-if-missing)
2. validateUniques.js
3. Mongo users → PG users
4. Mongo petitions → PG petitions
5. Mongo FIRs → PG firs (petitionId string → petitions.legacy_id → UUID)
6. Validate counts + orphan report
7. Runtime PG primary (flags)
```

### `validateUniques.js` checks (report + stop affected path; no silent merge)

- `users.email`, `users.badge`
- `petitions.legacy_id`, `petitions.petition_no`
- `firs.fir_no`

Then apply `002_conditional_uniques.sql` only for constraints that passed.

### Identity / UPSERT rules

- Prefer match on **`mongo_id`**.
- Petitions: if no `mongo_id` match, match on **`legacy_id`** only.
- Collision on `email` / `badge` / `fir_no` / `petition_no` **without** matching identity key → **fail row + report**; **never** `ON CONFLICT DO UPDATE` on those business keys alone.
- Passwords: copy Mongo `password` → `password_hash` **without rehashing** when value looks like bcrypt (`$2…`); otherwise skip/flag.
- Orphan FIR (no petition): no insert; sync row with `postgres_id=NULL`, `mongo_id` set, `failed` + error.
- Scripts: idempotent, restartable, per-row errors, count validation.

### Legal

Validate only (unless a measured gap requires a one-off load). Do not dual-write legal to Mongo. Do not resurrect old JSONB `doc` dump.

---

## 9. Error / fallback matrix

| Situation | Behavior |
|-----------|----------|
| PG write fails | Fail request; no Mongo write |
| PG OK, Mongo sync fails | HTTP success; `sync_status=failed` + `last_error`; replay from PG |
| PG miss + fallback | Return Mongo; log; **no auto-backfill** |
| PG down + fallback | Return Mongo; log; no auto-backfill |
| PG down, fallback off | 503 |
| Legal PG fail | Optional Mongo **read-only** fallback; never write legal to Mongo |
| Orphan FIR | Skip; nullable `postgres_id` failure row |
| Non-bcrypt password | Skip/flag user |

Replay: `replayFailedMongoSync.js` reads failed `pg_to_mongo` rows, loads PG by `postgres_id`, pushes via Mongo adapter, updates status.

---

## 10. Cutover phases

| Phase | State |
|-------|--------|
| **A** | PG primary + `MONGO_SYNC` + `MONGO_FALLBACK` |
| **B** | Drive sync failures → 0; quiet fallback logs |
| **C** | `MONGO_SYNC=false` (PG-only writes) |
| **D** | `MONGO_FALLBACK=false` |
| **E** | **Remove all runtime Mongo dependencies** (adapters, imports, connection init, packages, tests, env vars, and migration-only runtime hooks)—only after the report confirms zero required Mongo fallback dependencies |

---

## 11. Testing & acceptance

### Tests

1. DDL dry-run on `legislative`
2. Unique validation before data migrate
3. Migrate users → petitions → firs; re-run for idempotency
4. API smoke: register/login (bcrypt), JWT UUID + legacy ObjectId, petition CRUD, file FIR (1:1), delete blocked when FIR exists
5. Catalog/RAG: `test_bns_catalog.js`, `test_bns_rag.js`, `search_laws_rag('bail','BNSS',5)`, legalsections `find_section`
6. Dual-write: Mongo down → PG write 2xx + failed sync row
7. Fallback: miss → Mongo return + log; confirm no PG insert
8. Final report artifact

### Acceptance checklist

- [ ] `fir-audit` works without frontend DB-driven changes
- [ ] PostgreSQL is primary data source
- [ ] Legal reads from normalized `laws_*` (+ RAG helpers)
- [ ] App data in `users` / `petitions` / `firs`
- [ ] Missing app tables created in `legislative`
- [ ] Existing Mongo app data migrated (or reported failures)
- [ ] New app writes sync to Mongo during transition
- [ ] PG failures fall back to Mongo where enabled (read-only)
- [ ] No duplicate legal corpus
- [ ] No accidental breakage of Mongo-dependent paths during Phase A
- [ ] Clear path to Phase E
- [ ] Final report lists: Mongo collections found; PG tables used/created; migrated counts; remaining Mongo deps; dual-write paths; fallback paths; schema mismatches / unresolved issues

---

## 12. Post-cutover debt (documented, not blocking)

- Normalize `petitions.date`, `petitions.filed_at`, FIR date/time TEXT fields to proper date/time types
- Optionally deepen use of `search_laws_rag` inside Node hybrid RAG
- Remove FAISS/Mongo legal paths once unused
- Phase E full Mongo dependency removal

---

## 13. Decision log

| Decision | Choice |
|----------|--------|
| Approach | A — repositories + dual-write orchestration |
| App + legal DB | Same `legislative` Postgres |
| Dual-write | App only; legal PG-canonical |
| FIR ↔ petition | UUID FK + UNIQUE(petition_id) 1:1 |
| API petition key | `legacy_id` |
| JWT | UUID vs mongo_id discriminated |
| Fallback backfill | Disabled |
| Sync observability | `migration_sync_status` with nullable `postgres_id` |
| Password migration | Copy bcrypt; no rehash |
| Frontend | Unchanged contracts |
