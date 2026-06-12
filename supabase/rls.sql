-- Defense-in-depth: Veryfi's app talks to Postgres ONLY via Prisma as the table
-- owner; nothing should be reachable through Supabase's PostgREST API surface.
-- Supabase grants anon/authenticated access to new tables in `public` by default,
-- so we (1) enable RLS with NO policies = deny-all for those roles, and
-- (2) revoke their table privileges outright, now and for future tables.
-- The Prisma connection is unaffected: the table owner bypasses non-FORCE RLS.

ALTER TABLE "Org"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Verification"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consent"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Integration"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScoringProfile"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEvent"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookEndpoint"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebhookDelivery"  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
