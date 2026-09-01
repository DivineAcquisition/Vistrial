-- Rollback for 20260835010000_forsight_foundation.sql.
-- Forsight holds no data of its own, so dropping the source records loses
-- only the pointer to each workspace's base. Re-seed after re-applying.

DROP TABLE IF EXISTS public.forsight_sources;

DROP FUNCTION IF EXISTS public.forsight_sources_clear_foreign_fields();

DROP TYPE IF EXISTS public.forsight_source_type;
