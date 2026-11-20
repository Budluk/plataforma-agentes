CREATE TABLE public.site_publications (
 id bigserial PRIMARY KEY,
 draft_id bigint NOT NULL UNIQUE REFERENCES public.content_drafts(id),
 approval_id bigint NOT NULL UNIQUE REFERENCES public.approvals(id),
 hook text NOT NULL,
 script text NOT NULL,
 caption text NOT NULL,
 hashtags text[] NOT NULL,
 language text NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(),
 audit_id bigint NOT NULL REFERENCES public.audit_events(id)
);
GRANT SELECT ON public.site_publications TO anon, authenticated;
GRANT ALL ON public.site_publications TO service_role;
ALTER TABLE public.site_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read released content" ON public.site_publications FOR SELECT TO anon, authenticated USING (true);
CREATE OR REPLACE FUNCTION public.ctl_publish_site(p_draft_id bigint, p_approval_id bigint, p_params_hash text, p_confirm text, p_ts numeric, p_run_id text, p_actor text, p_detail text, p_canon text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.approvals; d public.content_drafts; params jsonb; audit_id bigint; publication_id bigint; halted boolean;
BEGIN
 PERFORM public.require_operator();
 IF p_confirm <> 'SIM' THEN RAISE EXCEPTION 'confirmação SIM obrigatória'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('audit_chain'));
 SELECT engaged INTO halted FROM public.kill_switch WHERE id = 1 FOR UPDATE;
 IF halted IS DISTINCT FROM false THEN RAISE EXCEPTION 'kill switch ativo ou ilegível'; END IF;
 SELECT * INTO a FROM public.approvals WHERE id = p_approval_id FOR UPDATE;
 IF NOT FOUND OR a.action <> 'publish.post' OR a.status <> 'approved' OR a.expires_ts <= public.ctl_now() OR a.params_hash <> p_params_hash THEN RAISE EXCEPTION 'aprovação inválida, usada ou vencida'; END IF;
 SELECT * INTO d FROM public.content_drafts WHERE id = p_draft_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'rascunho ausente'; END IF;
 params := a.params_json::jsonb;
 IF params->>'content_hash' IS DISTINCT FROM d.content_hash OR params->>'persona_id' IS DISTINCT FROM d.persona_id OR params->>'caption' IS DISTINCT FROM left(d.caption,2200) OR encode(sha256(convert_to(d.hook || d.script || d.caption,'UTF8')),'hex') <> d.content_hash THEN RAISE EXCEPTION 'conteúdo diferente do aprovado'; END IF;
 IF EXISTS (SELECT 1 FROM public.site_publications WHERE draft_id = d.id) THEN RAISE EXCEPTION 'conteúdo já publicado'; END IF;
 IF NOT public.ctl_try_record_call('publish.post','execution',3,3600) THEN RAISE EXCEPTION 'limite de execuções atingido'; END IF;
 UPDATE public.approvals SET status = 'used', result_json = '{"publicado":true,"destino":"site"}' WHERE id = a.id;
 audit_id := public.ctl_append_audit_exact(p_ts,p_run_id,p_actor,'stage_completed','publication','ok',p_detail,p_canon);
 INSERT INTO public.site_publications(draft_id,approval_id,hook,script,caption,hashtags,language,audit_id) VALUES(d.id,a.id,d.hook,d.script,d.caption,d.hashtags,d.language,audit_id) RETURNING id INTO publication_id;
 RETURN publication_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.ctl_publish_site(bigint,bigint,text,text,numeric,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ctl_publish_site(bigint,bigint,text,text,numeric,text,text,text,text) TO authenticated;