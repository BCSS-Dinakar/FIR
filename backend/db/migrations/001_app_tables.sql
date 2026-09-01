-- App tables for FIRAudit on legislative DB (create-if-missing).
-- Does NOT touch laws_* / RAG helpers.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id TEXT UNIQUE,
  name TEXT NOT NULL,
  badge TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  mobile TEXT NOT NULL,
  station TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  rank TEXT NOT NULL DEFAULT 'Inspector',
  state TEXT NOT NULL DEFAULT 'Telangana',
  district TEXT NOT NULL DEFAULT 'Hyderabad',
  theme_mode_ui TEXT NOT NULL DEFAULT 'dark',
  sidebar_collapse BOOLEAN NOT NULL DEFAULT false,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS petitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id TEXT UNIQUE,
  legacy_id TEXT NOT NULL UNIQUE,
  petition_no TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  complainant TEXT NOT NULL DEFAULT 'Unknown',
  accused TEXT NOT NULL DEFAULT 'Unknown',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  section_recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  score INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending Filing',
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_file TEXT NOT NULL,
  step1_output TEXT NOT NULL DEFAULT '',
  step2_output TEXT NOT NULL DEFAULT '',
  step3_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  fir_no TEXT NOT NULL DEFAULT '',
  filed_at TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_petitions_status ON petitions(status);
CREATE INDEX IF NOT EXISTS idx_petitions_user_id ON petitions(user_id);
CREATE INDEX IF NOT EXISTS idx_petitions_petition_no ON petitions(petition_no);

CREATE TABLE IF NOT EXISTS firs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id TEXT UNIQUE,
  fir_no TEXT NOT NULL,
  petition_id UUID NOT NULL UNIQUE
    REFERENCES petitions(id) ON DELETE RESTRICT,
  district TEXT NOT NULL DEFAULT '',
  police_station TEXT NOT NULL DEFAULT '',
  year TEXT NOT NULL DEFAULT '',
  fir_date TEXT NOT NULL DEFAULT '',
  fir_time TEXT NOT NULL DEFAULT '',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  occurrence_day TEXT NOT NULL DEFAULT '',
  occurrence_date_from TEXT NOT NULL DEFAULT '',
  occurrence_time_from TEXT NOT NULL DEFAULT '',
  occurrence_date_to TEXT NOT NULL DEFAULT '',
  occurrence_time_to TEXT NOT NULL DEFAULT '',
  prior_to_time_period TEXT NOT NULL DEFAULT '',
  received_date TEXT NOT NULL DEFAULT '',
  received_time TEXT NOT NULL DEFAULT '',
  gd_entry_no TEXT NOT NULL DEFAULT '',
  gd_date_time TEXT NOT NULL DEFAULT '',
  type_of_information TEXT NOT NULL DEFAULT 'Written',
  distance_direction TEXT NOT NULL DEFAULT '',
  beat_no TEXT NOT NULL DEFAULT '',
  occurrence_address TEXT NOT NULL DEFAULT '',
  outside_limit_ps_name TEXT NOT NULL DEFAULT '',
  outside_limit_district TEXT NOT NULL DEFAULT '',
  complainant TEXT NOT NULL DEFAULT '',
  complainant_relative TEXT NOT NULL DEFAULT '',
  complainant_dob TEXT NOT NULL DEFAULT '',
  complainant_age TEXT NOT NULL DEFAULT '',
  complainant_nationality TEXT NOT NULL DEFAULT 'India',
  complainant_caste TEXT NOT NULL DEFAULT '',
  complainant_passport TEXT NOT NULL DEFAULT '',
  complainant_passport_issue_date TEXT NOT NULL DEFAULT '',
  complainant_passport_issue_place TEXT NOT NULL DEFAULT '',
  complainant_occupation TEXT NOT NULL DEFAULT '',
  complainant_phone TEXT NOT NULL DEFAULT '',
  complainant_address TEXT NOT NULL DEFAULT '',
  accused TEXT NOT NULL DEFAULT '',
  accused_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasons_for_delay TEXT NOT NULL DEFAULT '',
  properties_stolen TEXT NOT NULL DEFAULT '',
  total_value_stolen TEXT NOT NULL DEFAULT '',
  inquest_report TEXT NOT NULL DEFAULT '',
  incident_facts TEXT NOT NULL DEFAULT '',
  action_taken TEXT NOT NULL DEFAULT '1',
  refused_investigation_due_to TEXT NOT NULL DEFAULT '',
  transferred_ps TEXT NOT NULL DEFAULT '',
  transferred_district TEXT NOT NULL DEFAULT '',
  officer_name TEXT NOT NULL DEFAULT '',
  officer_rank TEXT NOT NULL DEFAULT '',
  officer_no TEXT NOT NULL DEFAULT '',
  dispatch_date_time TEXT NOT NULL DEFAULT '',
  filed_at TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firs_fir_no ON firs(fir_no);

CREATE TABLE IF NOT EXISTS migration_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('users', 'petitions', 'firs')),
  postgres_id UUID,
  mongo_id TEXT,
  sync_direction TEXT NOT NULL CHECK (sync_direction IN ('mongo_to_pg', 'pg_to_mongo')),
  sync_status TEXT NOT NULL CHECK (sync_status IN ('synced', 'pending', 'failed')),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_sync_unique
  ON migration_sync_status (entity_type, postgres_id, sync_direction)
  WHERE postgres_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_migration_sync_failed
  ON migration_sync_status (sync_status)
  WHERE sync_status = 'failed';
