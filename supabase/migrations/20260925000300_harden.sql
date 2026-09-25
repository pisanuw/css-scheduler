-- ============================================================================
-- Hardening, from the Supabase database linter.
-- ============================================================================

-- A view created without this runs with the *creator's* rights, so querying
-- section_meetings would bypass RLS on sections and expose draft scenarios.
-- security_invoker makes the view honour the caller's own policies.
alter view section_meetings set (security_invoker = on);

-- Pin the search_path so the function cannot be hijacked by a caller-supplied
-- one. pg_catalog is always searched first, so now() still resolves.
alter function set_updated_at() set search_path = '';

-- ---------------------------------------------------------------------------
-- Function EXECUTE privileges.
--
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which is how `anon`
-- ends up able to call these over /rest/v1/rpc. Revoke PUBLIC, then grant
-- back only to the roles that genuinely need it.
--
-- `authenticated` DOES need EXECUTE on the policy helpers. A policy expression
-- is evaluated with the privileges of the querying role, so revoking it makes
-- every policy that calls one fail with "permission denied for function"
-- rather than simply returning no rows. supabase/tests/rls_test.sql covers
-- this; it is the check that caught it.
-- ---------------------------------------------------------------------------

alter default privileges in schema public revoke execute on functions from public;

revoke execute on function auth_role()         from public, anon, authenticated;
revoke execute on function is_coordinator()    from public, anon, authenticated;
revoke execute on function my_instructor_id()  from public, anon, authenticated;
revoke execute on function cycle_is_open(uuid) from public, anon, authenticated;
revoke execute on function handle_new_user()   from public, anon, authenticated;
revoke execute on function set_updated_at()    from public, anon, authenticated;

-- Needed by RLS policies. These are SECURITY DEFINER but disclose nothing the
-- caller cannot already see: each reports on the caller's own profile, and
-- cycle_is_open reports a cycle status that every signed-in user may read.
grant execute on function auth_role()         to authenticated;
grant execute on function is_coordinator()    to authenticated;
grant execute on function my_instructor_id()  to authenticated;
grant execute on function cycle_is_open(uuid) to authenticated;

-- Trigger functions: executed on behalf of whoever writes the row.
grant execute on function set_updated_at()  to authenticated;
grant execute on function handle_new_user() to supabase_auth_admin;
