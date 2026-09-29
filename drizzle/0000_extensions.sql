CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- Folds text for search: strips ʻokina (U+02BB) and apostrophe variants, removes
-- diacritics such as kahakō via unaccent, and lowercases. Declared IMMUTABLE so it
-- can back generated tsvector columns and trigram indexes.
CREATE OR REPLACE FUNCTION app_normalize(input text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT lower(public.unaccent('public.unaccent'::regdictionary,
    translate(input, U&'\02BB\02BC\2018\2019''`', '')))
$$;
