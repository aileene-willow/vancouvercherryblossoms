"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BloomStatusDB = void 0;
class BloomStatusDB {
    constructor(pool) {
        this.pool = pool;
    }
    async getStreetStatus(street) {
        console.log('Getting status for street:', street);
        const query = `
            WITH latest_status AS (
                SELECT 
                    street_id,
                    status,
                    last_updated as timestamp,
                    latitude,
                    longitude,
                    neighborhood,
                    ROW_NUMBER() OVER (PARTITION BY street_id ORDER BY last_updated DESC) as rn
                FROM current_bloom_status
            )
            SELECT 
                s.name AS street,
                s.tree_count,
                COALESCE(ls.status, 'unknown') as status,
                ls.timestamp,
                ls.latitude,
                ls.longitude,
                ls.neighborhood
            FROM streets s
            LEFT JOIN latest_status ls ON s.id = ls.street_id AND ls.rn = 1
            WHERE s.name = $1
        `;
        const result = await this.pool.query(query, [street]);
        console.log('Query result:', result.rows[0]);
        if (result.rows.length === 0) {
            console.log('No status found for street:', street);
            return null;
        }
        return result.rows[0];
    }
    async updateStatus(street, status, neighborhood, latitude, longitude, treeCount) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`INSERT INTO bloom_status 
                (street, status, neighborhood, latitude, longitude, tree_count, last_updated)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                RETURNING id, street, status, neighborhood, latitude, longitude, tree_count, last_updated`, [street, status, neighborhood, latitude || null, longitude || null, treeCount || null]);
            return result.rows[0];
        }
        finally {
            client.release();
        }
    }
    async getNeighborhoodStats(neighborhood) {
        console.log(`Starting to fetch stats for neighborhood: ${neighborhood}`);
        const client = await this.pool.connect();
        try {
            // Set statement timeout to 3 seconds
            await client.query('SET statement_timeout = 3000');
            // Simplified query without LATERAL join
            const query = `
                SELECT 
                    CAST(COUNT(DISTINCT s.id) AS INTEGER) as total_streets,
                    CAST(COUNT(DISTINCT CASE WHEN bs.status = 'blooming' THEN s.id END) AS INTEGER) as blooming_count,
                    CAST(COUNT(DISTINCT CASE WHEN bs.status IS NULL OR bs.status = 'unknown' THEN s.id END) AS INTEGER) as unknown_count,
                    MAX(bs.last_updated) as last_updated
                FROM streets s
                LEFT JOIN (
                    SELECT DISTINCT ON (street) 
                        street,
                        status,
                        last_updated
                    FROM bloom_status
                    ORDER BY street, last_updated DESC
                ) bs ON s.name = bs.street
                WHERE s.neighborhood = $1
                GROUP BY s.neighborhood`;
            console.log('Executing neighborhood stats query...');
            const startTime = Date.now();
            const result = await client.query(query, [neighborhood]);
            const duration = Date.now() - startTime;
            console.log(`Query completed in ${duration}ms`);
            // If no results, return zero counts
            if (!result.rows[0]) {
                return {
                    total_streets: 0,
                    blooming_count: 0,
                    unknown_count: 0,
                    last_updated: null
                };
            }
            return result.rows[0];
        }
        catch (error) {
            console.error('Error in getNeighborhoodStats:', error);
            // Return zero counts on error
            return {
                total_streets: 0,
                blooming_count: 0,
                unknown_count: 0,
                last_updated: null,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
        finally {
            // Reset statement timeout to default
            try {
                await client.query('RESET statement_timeout');
            }
            catch (error) {
                console.error('Error resetting statement timeout:', error);
            }
            client.release();
        }
    }
    async getRecentReports(limit = 10) {
        const query = `
            SELECT 
                s.name as street,
                s.neighborhood,
                s.tree_count,
                bsr.status,
                bsr.timestamp,
                bsr.latitude,
                bsr.longitude
            FROM bloom_status_reports bsr
            JOIN streets s ON s.id = bsr.street_id
            ORDER BY bsr.timestamp DESC
            LIMIT $1
        `;
        const result = await this.pool.query(query, [limit]);
        return result.rows;
    }
}
exports.BloomStatusDB = BloomStatusDB;
