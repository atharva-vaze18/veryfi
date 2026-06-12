-- RLS regression test. Run in the Supabase SQL editor (or psql as postgres).
-- Expectation: every app table has rowsecurity = true, and the anon role can
-- read NOTHING. Re-run after any `prisma db push` that creates a new table —
-- then add the new table to ../rls.sql and re-apply it.

-- 1) Every app table must have RLS enabled (expect 10 rows, all rowsecurity = t)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('Org','User','Verification','Consent','ApiKey','Integration',
                    'ScoringProfile','AuditEvent','WebhookEndpoint','WebhookDelivery')
ORDER BY tablename;

-- 2) anon/authenticated must hold no privileges on app tables (expect 0 rows)
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');

-- 3) Behavioral check: as anon, selecting must yield zero rows / permission error.
SET LOCAL ROLE anon;
SELECT count(*) AS anon_visible_orgs FROM "Org";  -- expect: permission denied
RESET ROLE;
