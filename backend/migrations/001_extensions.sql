CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() nu e IMMUTABLE, deci nu poate fi folosit direct într-o coloană
-- generată; wrapper-ul de mai jos fixează dicționarul și devine imutabil.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text AS
$$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;
