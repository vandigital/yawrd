CREATE SCHEMA yawrd;

CREATE TABLE yawrd.projects (
  network text NOT NULL CHECK (network = 'testnet'),
  id text NOT NULL CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,62}$' AND id <> 'the-common-table'),
  creator_account_id text NOT NULL CHECK (creator_account_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' AND length(creator_account_id) BETWEEN 2 AND 64),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 2000),
  objectives jsonb NOT NULL CHECK (jsonb_typeof(objectives) = 'array'),
  participation text NOT NULL,
  rewards text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (network, id)
);

CREATE TABLE yawrd.restricted_content (
  network text NOT NULL,
  project_id text NOT NULL,
  content text NOT NULL CHECK (length(content) BETWEEN 1 AND 20000),
  PRIMARY KEY (network, project_id),
  FOREIGN KEY (network, project_id) REFERENCES yawrd.projects(network, id)
);

CREATE TABLE yawrd.auth_challenges (
  id text PRIMARY KEY CHECK (length(id) = 43),
  browser_hash text NOT NULL CHECK (browser_hash ~ '^[a-f0-9]{64}$'),
  account_id text NOT NULL CHECK (account_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' AND length(account_id) BETWEEN 2 AND 64),
  network text NOT NULL CHECK (network = 'testnet'),
  origin text NOT NULL,
  message text NOT NULL,
  recipient text NOT NULL,
  nonce text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at = issued_at + interval '5 minutes'),
  consumed_at timestamptz,
  UNIQUE (id, network, account_id)
);
CREATE INDEX challenge_browser ON yawrd.auth_challenges(browser_hash, issued_at DESC);
CREATE INDEX challenge_expiry ON yawrd.auth_challenges(expires_at);

CREATE TABLE yawrd.sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  challenge_id text NOT NULL UNIQUE,
  network text NOT NULL CHECK (network = 'testnet'),
  account_id text NOT NULL,
  public_key text NOT NULL,
  block_height bigint NOT NULL CHECK (block_height > 0),
  block_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (statement_timestamp() + interval '1 hour'),
  revoked_at timestamptz,
  FOREIGN KEY (challenge_id, network, account_id) REFERENCES yawrd.auth_challenges(id, network, account_id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '1 hour')
);
CREATE INDEX session_expiry ON yawrd.sessions(expires_at);

CREATE TABLE yawrd.applications (
  id uuid PRIMARY KEY,
  network text NOT NULL,
  project_id text NOT NULL,
  account_id text NOT NULL CHECK (account_id ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' AND length(account_id) BETWEEN 2 AND 64),
  introduction text NOT NULL CHECK (length(introduction) BETWEEN 1 AND 1000),
  consent_version text NOT NULL CHECK (consent_version = 'participant-v1'),
  consented_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (network, project_id) REFERENCES yawrd.projects(network, id),
  UNIQUE (network, project_id, account_id),
  UNIQUE (id, network, project_id)
);

CREATE TABLE yawrd.review_decisions (
  application_id uuid PRIMARY KEY,
  network text NOT NULL,
  project_id text NOT NULL,
  reviewer_account_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (application_id, network, project_id) REFERENCES yawrd.applications(id, network, project_id)
);

CREATE FUNCTION yawrd.prevent_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable_record' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER immutable_applications BEFORE UPDATE OR DELETE ON yawrd.applications FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();
CREATE TRIGGER immutable_decisions BEFORE UPDATE OR DELETE ON yawrd.review_decisions FOR EACH ROW EXECUTE FUNCTION yawrd.prevent_mutation();

CREATE FUNCTION yawrd.protect_creator() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.network IS DISTINCT FROM OLD.network OR NEW.id IS DISTINCT FROM OLD.id OR NEW.creator_account_id IS DISTINCT FROM OLD.creator_account_id THEN
    RAISE EXCEPTION 'immutable_project_identity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_project_identity BEFORE UPDATE ON yawrd.projects FOR EACH ROW EXECUTE FUNCTION yawrd.protect_creator();

CREATE FUNCTION yawrd.check_reviewer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM yawrd.projects WHERE network = NEW.network AND id = NEW.project_id AND creator_account_id = NEW.reviewer_account_id) THEN
    RAISE EXCEPTION 'creator_only' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER creator_review BEFORE INSERT ON yawrd.review_decisions FOR EACH ROW EXECUTE FUNCTION yawrd.check_reviewer();

CREATE TABLE yawrd.auth_rate_limits (
  account_id text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 10),
  resets_at timestamptz NOT NULL
);
