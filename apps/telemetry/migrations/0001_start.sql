-- The receiver's tables (docs/telemetry.md, "What it keeps"). In SQL, as D1's
-- own migrations: MikroORM doesn't run on D1, and it's one small database.

-- One row for each server that reports, replaced by its next summary: the
-- summary's own fields, and the days it first and last reported. Deleted 30
-- days after its last report.
CREATE TABLE installs (
  install_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  install TEXT NOT NULL,
  arch TEXT NOT NULL,
  db TEXT NOT NULL,
  -- {"ai": true, "photos": false, ...}
  modules TEXT NOT NULL,
  -- ["anthropic"], or null from 0.1.0-alpha.1, which didn't send them.
  ai_providers TEXT,
  households TEXT NOT NULL,
  people TEXT NOT NULL,
  recipes TEXT NOT NULL,
  first_day TEXT NOT NULL,
  last_day TEXT NOT NULL
);

CREATE INDEX installs_last_day ON installs (last_day);

-- Each night's totals, with no install ids, kept for good.
CREATE TABLE days (
  day TEXT PRIMARY KEY,
  totals TEXT NOT NULL
);

-- Summaries turned down, counted by day and reason, so a sender bug shows
-- up without keeping the summaries.
CREATE TABLE rejections (
  day TEXT NOT NULL,
  reason TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, reason)
);

-- Merran's releases, from GitHub, so only real versions show by name.
CREATE TABLE releases (
  version TEXT PRIMARY KEY
);
