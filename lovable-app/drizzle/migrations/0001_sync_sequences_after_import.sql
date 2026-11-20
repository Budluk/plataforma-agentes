SELECT setval('public.agent_runs_id_seq', GREATEST((SELECT coalesce(max(id), 0) FROM public.agent_runs), 1));
SELECT setval('public.alerts_id_seq', GREATEST((SELECT coalesce(max(id), 0) FROM public.alerts), 1));
SELECT setval('public.audit_events_id_seq', GREATEST((SELECT coalesce(max(id), 0) FROM public.audit_events), 1));
SELECT setval('public.approvals_id_seq', GREATEST((SELECT coalesce(max(id), 0) FROM public.approvals), 1));
SELECT setval('public.action_calls_id_seq', GREATEST((SELECT coalesce(max(id), 0) FROM public.action_calls), 1));