-- Roles
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- First account becomes the operator (admin). Later accounts get no role.
CREATE OR REPLACE FUNCTION public.assign_first_operator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('assign_first_operator'));
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created_assign_operator
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.assign_first_operator();

CREATE OR REPLACE FUNCTION public.require_operator()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'operador necessário' USING ERRCODE = '42501';
  END IF;
END $$;

-- Generic operator-only tables
CREATE TABLE public.capabilities (
  agent text NOT NULL,
  tool text NOT NULL,
  PRIMARY KEY (agent, tool)
);
CREATE TABLE public.agent_runs (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  agent text NOT NULL,
  asset text,
  status text NOT NULL,
  detail text
);
CREATE INDEX ix_agent_runs_ts ON public.agent_runs (ts DESC);
CREATE TABLE public.alerts (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  asset text NOT NULL,
  payload jsonb NOT NULL
);
CREATE TABLE public.event_logs (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  stream text NOT NULL,
  event text NOT NULL,
  run_id text,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_event_logs_ts ON public.event_logs (ts DESC);
CREATE INDEX ix_event_logs_run ON public.event_logs (run_id);
CREATE TABLE public.trend_observations (
  id bigserial PRIMARY KEY,
  source text NOT NULL,
  subject_id text NOT NULL,
  topic text NOT NULL,
  url text NOT NULL,
  language text NOT NULL,
  region text NOT NULL,
  collected_at timestamptz NOT NULL,
  published_at timestamptz,
  metric text NOT NULL,
  views integer CHECK (views IS NULL OR views >= 0),
  UNIQUE (source, subject_id, language, region, collected_at)
);
CREATE TABLE public.personas (
  persona_id text PRIMARY KEY CHECK (char_length(persona_id) BETWEEN 1 AND 40),
  schema_version integer NOT NULL DEFAULT 1,
  enabled boolean NOT NULL DEFAULT false,
  language text NOT NULL,
  niche text NOT NULL DEFAULT '',
  editorial_identity text NOT NULL DEFAULT '',
  style text NOT NULL DEFAULT '',
  allowed_topics text[] NOT NULL DEFAULT '{}',
  forbidden_topics text[] NOT NULL DEFAULT '{}',
  accounts text[] NOT NULL DEFAULT '{}',
  credential_reference text,
  require_sources_for_factual_claims boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.content_drafts (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  persona_id text NOT NULL,
  tema text NOT NULL,
  hook text NOT NULL,
  script text NOT NULL,
  caption text NOT NULL,
  hashtags text[] NOT NULL DEFAULT '{}',
  language text NOT NULL,
  content_hash text NOT NULL
);
CREATE TABLE public.portfolio (
  id integer PRIMARY KEY CHECK (id = 1),
  equity double precision,
  daily_pnl_pct double precision,
  equity_snapshot_consistent boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.dev_outputs (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  filename text NOT NULL UNIQUE,
  code text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.research_notes (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  asset text NOT NULL,
  name text NOT NULL UNIQUE,
  body text NOT NULL
);
CREATE TABLE public.publish_dryrun (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  line text NOT NULL
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['capabilities','agent_runs','alerts','event_logs','trend_observations','personas','content_drafts','portfolio','dev_outputs','research_notes','publish_dryrun']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "operator full access" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin'')) WITH CHECK (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Control store: read-only for the operator; writes only through the functions below.
CREATE TABLE public.audit_events (
  id bigserial PRIMARY KEY,
  ts double precision NOT NULL,
  run_id text NOT NULL,
  actor text NOT NULL,
  event text NOT NULL,
  action text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '{}',
  prev_hash text NOT NULL,
  hash text NOT NULL
);
CREATE TABLE public.approvals (
  id bigserial PRIMARY KEY,
  created_ts double precision NOT NULL,
  action text NOT NULL,
  params_json text NOT NULL,
  params_hash text NOT NULL,
  actor text NOT NULL,
  run_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','approved','denied','expired','used','failed')),
  expires_ts double precision NOT NULL,
  decided_ts double precision,
  decided_by text,
  result_json text
);
CREATE TABLE public.kill_switch (
  id integer PRIMARY KEY CHECK (id = 1),
  engaged boolean NOT NULL,
  ts double precision NOT NULL,
  reason text NOT NULL,
  set_by text NOT NULL
);
CREATE TABLE public.action_calls (
  id bigserial PRIMARY KEY,
  ts double precision NOT NULL,
  action text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('proposal','execution'))
);
CREATE INDEX ix_action_calls ON public.action_calls (action, kind, ts);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_events','approvals','kill_switch','action_calls']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "operator reads" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.audit_events_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events é somente inserção';
END $$;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_events_append_only();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.audit_events_append_only();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON public.audit_events FOR EACH STATEMENT EXECUTE FUNCTION public.audit_events_append_only();

INSERT INTO public.kill_switch (id, engaged, ts, reason, set_by) VALUES (1, false, 0, '', '') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.ctl_now() RETURNS double precision LANGUAGE sql VOLATILE AS $$
  SELECT extract(epoch FROM clock_timestamp())::double precision
$$;

-- Append to the hash chain. p_canon is canonical([ts, run_id, actor, event, action, status, detail]).
CREATE OR REPLACE FUNCTION public.ctl_append_audit(p_ts double precision, p_run_id text, p_actor text, p_event text, p_action text, p_status text, p_detail text, p_canon text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prev text; h text; new_id bigint;
BEGIN
  PERFORM public.require_operator();
  PERFORM pg_advisory_xact_lock(hashtext('audit_chain'));
  SELECT hash INTO prev FROM public.audit_events ORDER BY id DESC LIMIT 1;
  prev := coalesce(prev, repeat('0', 64));
  h := encode(sha256(convert_to(prev || p_canon, 'UTF8')), 'hex');
  INSERT INTO public.audit_events (ts, run_id, actor, event, action, status, detail, prev_hash, hash)
  VALUES (p_ts, p_run_id, p_actor, p_event, p_action, p_status, p_detail, prev, h) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.ctl_try_record_call(p_action text, p_kind text, p_limit integer, p_window integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; now_ts double precision;
BEGIN
  PERFORM public.require_operator();
  PERFORM pg_advisory_xact_lock(hashtext('action_calls:' || p_action || ':' || p_kind));
  now_ts := public.ctl_now();
  SELECT count(*) INTO n FROM public.action_calls WHERE action = p_action AND kind = p_kind AND ts > now_ts - p_window;
  IF n >= p_limit THEN RETURN false; END IF;
  INSERT INTO public.action_calls (ts, action, kind) VALUES (now_ts, p_action, p_kind);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.ctl_create_approval(p_action text, p_params_json text, p_params_hash text, p_actor text, p_run_id text, p_ttl integer)
RETURNS public.approvals LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.approvals; now_ts double precision;
BEGIN
  PERFORM public.require_operator();
  now_ts := public.ctl_now();
  INSERT INTO public.approvals (created_ts, action, params_json, params_hash, actor, run_id, status, expires_ts)
  VALUES (now_ts, p_action, p_params_json, p_params_hash, p_actor, p_run_id, 'pending', now_ts + p_ttl) RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.ctl_human_decide(p_id bigint, p_approve boolean, p_by text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st text; exp double precision; now_ts double precision; result text;
BEGIN
  PERFORM public.require_operator();
  now_ts := public.ctl_now();
  SELECT status, expires_ts INTO st, exp FROM public.approvals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF st <> 'pending' THEN RETURN 'already_' || st; END IF;
  IF exp <= now_ts THEN
    UPDATE public.approvals SET status = 'expired' WHERE id = p_id;
    RETURN 'expired';
  END IF;
  result := CASE WHEN p_approve THEN 'approved' ELSE 'denied' END;
  UPDATE public.approvals SET status = result, decided_ts = now_ts, decided_by = p_by WHERE id = p_id;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.ctl_consume(p_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  PERFORM public.require_operator();
  UPDATE public.approvals SET status = 'used' WHERE id = p_id AND status = 'approved' AND expires_ts > public.ctl_now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END $$;

CREATE OR REPLACE FUNCTION public.ctl_finish(p_id bigint, p_ok boolean, p_result_json text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_operator();
  UPDATE public.approvals SET status = CASE WHEN p_ok THEN 'used' ELSE 'failed' END, result_json = p_result_json
  WHERE id = p_id AND status = 'used';
END $$;

CREATE OR REPLACE FUNCTION public.ctl_kill_engage(p_reason text, p_by text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_operator();
  UPDATE public.kill_switch SET engaged = true, ts = public.ctl_now(), reason = left(p_reason, 200), set_by = p_by WHERE id = 1;
END $$;

CREATE OR REPLACE FUNCTION public.ctl_kill_release(p_by text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_operator();
  UPDATE public.kill_switch SET engaged = false, ts = public.ctl_now(), reason = '', set_by = p_by WHERE id = 1;
END $$;

REVOKE EXECUTE ON FUNCTION public.ctl_append_audit, public.ctl_try_record_call, public.ctl_create_approval, public.ctl_human_decide, public.ctl_consume, public.ctl_finish, public.ctl_kill_engage, public.ctl_kill_release FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ctl_append_audit, public.ctl_try_record_call, public.ctl_create_approval, public.ctl_human_decide, public.ctl_consume, public.ctl_finish, public.ctl_kill_engage, public.ctl_kill_release TO authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_first_operator() FROM PUBLIC, anon, authenticated;