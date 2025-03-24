-- Create enum for bloom status
CREATE TYPE bloom_status AS ENUM ('blooming', 'unknown');

-- Create table for streets
CREATE TABLE streets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    neighborhood VARCHAR(255) NOT NULL,
    tree_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, neighborhood)
);

-- Create table for bloom status reports
CREATE TABLE bloom_status_reports (
    id SERIAL PRIMARY KEY,
    street_id INTEGER REFERENCES streets(id),
    status bloom_status NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reporter VARCHAR(255) NOT NULL DEFAULT 'Anonymous',
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8)
);

-- Create view for current status
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

-- Create indexes for performance
CREATE INDEX idx_streets_neighborhood ON streets(neighborhood);
CREATE INDEX idx_bloom_status_street_id ON bloom_status_reports(street_id);
CREATE INDEX idx_bloom_status_timestamp ON bloom_status_reports(timestamp);
CREATE INDEX idx_bloom_status_street_timestamp ON bloom_status_reports(street_id, timestamp DESC); 