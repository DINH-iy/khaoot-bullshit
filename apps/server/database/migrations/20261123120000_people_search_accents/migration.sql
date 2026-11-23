-- Searching people ignores accents as well as capitals ("anouk" finds "Anoúk"): people/directory.ts.
-- unaccent ships with PostgreSQL and is a trusted extension, so the database owner may enable it.
CREATE EXTENSION IF NOT EXISTS unaccent;
