-- Start transaction
BEGIN;

-- Create temporary table to store existing bloom status data if the old table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'bloom_status') THEN
        CREATE TEMPORARY TABLE temp_bloom_status AS
        SELECT * FROM bloom_status;
    END IF;
END
$$;

-- Drop view if exists
DROP VIEW IF EXISTS current_bloom_status;

-- Create enum if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bloom_status') THEN
        CREATE TYPE bloom_status AS ENUM ('blooming', 'unknown');
    END IF;
END
$$;

-- Create streets table if not exists
CREATE TABLE IF NOT EXISTS streets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    neighborhood VARCHAR(255) NOT NULL,
    tree_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, neighborhood)
);

-- Create bloom_status_reports table if not exists
CREATE TABLE IF NOT EXISTS bloom_status_reports (
    id SERIAL PRIMARY KEY,
    street_id INTEGER REFERENCES streets(id),
    status bloom_status NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reporter VARCHAR(255) NOT NULL DEFAULT 'Anonymous',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8)
);

-- Migrate data from old bloom_status table if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'temp_bloom_status') THEN
        -- Insert streets first
        INSERT INTO streets (name, neighborhood, tree_count)
        SELECT DISTINCT street, neighborhood, tree_count
        FROM temp_bloom_status
        ON CONFLICT (name, neighborhood) 
        DO UPDATE SET tree_count = EXCLUDED.tree_count;

        -- Then insert status reports
        INSERT INTO bloom_status_reports (street_id, status, timestamp, latitude, longitude)
        SELECT 
            s.id,
            bs.status::bloom_status,
            bs.last_updated,
            bs.latitude,
            bs.longitude
        FROM temp_bloom_status bs
        JOIN streets s ON s.name = bs.street AND s.neighborhood = bs.neighborhood;
    END IF;
END
$$;

-- Create or replace the current status view
CREATE OR REPLACE VIEW current_bloom_status AS
SELECT DISTINCT ON (s.id)
    s.id AS street_id,
    s.name AS street_name,
    s.neighborhood,
    s.tree_count,
    bsr.status,
    bsr.timestamp AS last_updated,
    bsr.latitude,
    bsr.longitude
FROM streets s
LEFT JOIN bloom_status_reports bsr ON s.id = bsr.street_id
ORDER BY s.id, bsr.timestamp DESC;

-- Create indexes for performance if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_streets_neighborhood') THEN
        CREATE INDEX idx_streets_neighborhood ON streets(neighborhood);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bloom_status_street_id') THEN
        CREATE INDEX idx_bloom_status_street_id ON bloom_status_reports(street_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bloom_status_timestamp') THEN
        CREATE INDEX idx_bloom_status_timestamp ON bloom_status_reports(timestamp);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bloom_status_street_timestamp') THEN
        CREATE INDEX idx_bloom_status_street_timestamp ON bloom_status_reports(street_id, timestamp DESC);
    END IF;
END
$$;

-- Drop old table if it exists
DROP TABLE IF EXISTS bloom_status;

-- Drop temporary table if it exists
DROP TABLE IF EXISTS temp_bloom_status;

-- Commit transaction
COMMIT; 