-- Preserve the installed pg_net function paths and restrict internal request data.
-- Cron runs as postgres; browsers and ordinary authenticated users do not need net access.
revoke all on schema net from public, anon, authenticated;
revoke all on all tables in schema net from public, anon, authenticated;
revoke all on all sequences in schema net from public, anon, authenticated;
revoke all on all functions in schema net from public, anon, authenticated;

