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
            SELECT 
                s.name AS street,
                s.tree_count,
                COALESCE(cs.status, 'unknown') as status,
                cs.last_updated as timestamp,
                cs.latitude,
                cs.longitude,
                cs.neighborhood
            FROM streets s
            LEFT JOIN current_bloom_status cs ON s.id = cs.street_id
            WHERE s.name = $1
            ORDER BY cs.last_updated DESC
            LIMIT 1
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
        // Use transaction to ensure data consistency
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Get or create street
            let streetResult = await client.query('SELECT id FROM streets WHERE name = $1 AND neighborhood = $2', [street, neighborhood]);
            let streetId;
            if (streetResult.rows.length === 0) {
                const insertStreet = await client.query('INSERT INTO streets (name, neighborhood, tree_count) VALUES ($1, $2, $3) RETURNING id', [street, neighborhood, treeCount]);
                streetId = insertStreet.rows[0].id;
            }
            else {
                streetId = streetResult.rows[0].id;
                // Update tree count if it has changed
                await client.query('UPDATE streets SET tree_count = $1 WHERE id = $2', [treeCount, streetId]);
            }
            // Insert new status report
            const statusResult = await client.query(`INSERT INTO bloom_status_reports 
                (street_id, status, latitude, longitude, reporter)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *`, [streetId, status, latitude, longitude, 'Anonymous']);
            // Verify the status was inserted
            const verifyResult = await client.query(`SELECT * FROM current_bloom_status WHERE street_id = $1`, [streetId]);
            if (verifyResult.rows.length === 0) {
                throw new Error('Status update failed to appear in current_bloom_status view');
            }
            await client.query('COMMIT');
            // Return formatted result
            return {
                street,
                status,
                timestamp: statusResult.rows[0].timestamp,
                neighborhood,
                latitude,
                longitude,
                treeCount
            };
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Error in updateStatus:', error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getNeighborhoodStats(neighborhood) {
        const query = `
            SELECT 
                CAST(COUNT(DISTINCT s.id) AS INTEGER) as total_streets,
                CAST(COUNT(DISTINCT CASE WHEN cs.status = 'blooming' THEN s.id END) AS INTEGER) as blooming_count,
                CAST(COUNT(DISTINCT CASE WHEN cs.status IS NULL OR cs.status = 'unknown' THEN s.id END) AS INTEGER) as unknown_count,
                MAX(cs.last_updated) as last_updated
            FROM streets s
            LEFT JOIN current_bloom_status cs ON s.id = cs.street_id
            WHERE s.neighborhood = $1
        `;
        const result = await this.pool.query(query, [neighborhood]);
        return result.rows[0];
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
