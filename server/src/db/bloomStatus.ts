import { Pool } from 'pg';
import { BloomStatus } from '../types/bloomStatus';

export class BloomStatusDB {
    constructor(private pool: Pool) { }

    async getStreetStatus(street: string): Promise<any> {
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

    async updateStatus(
        street: string,
        status: string,
        neighborhood: string,
        latitude?: number,
        longitude?: number,
        treeCount?: number
    ) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // First, ensure the street exists
            const streetResult = await client.query(
                `INSERT INTO streets (name, neighborhood, tree_count)
                VALUES ($1, $2, $3)
                ON CONFLICT (name, neighborhood) 
                DO UPDATE SET tree_count = EXCLUDED.tree_count
                RETURNING id`,
                [street, neighborhood, treeCount || 0]
            );

            // Insert the status report
            const result = await client.query(
                `INSERT INTO bloom_status_reports 
                (street_id, status, timestamp, latitude, longitude)
                VALUES ($1, $2::bloom_status, NOW(), $3, $4)
                RETURNING id, 
                    (SELECT name FROM streets WHERE id = $1) as street,
                    status,
                    (SELECT neighborhood FROM streets WHERE id = $1) as neighborhood,
                    latitude,
                    longitude,
                    (SELECT tree_count FROM streets WHERE id = $1) as tree_count,
                    timestamp as last_updated`,
                [streetResult.rows[0].id, status, latitude || null, longitude || null]
            );

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error in updateStatus:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async getNeighborhoodStats(neighborhood: string): Promise<any> {
        console.log(`Starting to fetch stats for neighborhood: ${neighborhood}`);
        const client = await this.pool.connect();
        
        try {
            // Set statement timeout to 3 seconds
            await client.query('SET statement_timeout = 3000');
            
            const query = `
                WITH latest_status AS (
                    SELECT DISTINCT ON (s.name)
                        s.name as street,
                        bsr.status,
                        bsr.timestamp as last_updated
                    FROM streets s
                    LEFT JOIN bloom_status_reports bsr ON s.id = bsr.street_id
                    WHERE s.neighborhood = $1
                    ORDER BY s.name, bsr.timestamp DESC
                )
                SELECT 
                    COUNT(DISTINCT street) as total_streets,
                    COUNT(DISTINCT CASE WHEN status = 'blooming' THEN street END) as blooming_count,
                    COUNT(DISTINCT CASE WHEN status IS NULL OR status = 'unknown' THEN street END) as unknown_count,
                    MAX(last_updated) as last_updated
                FROM latest_status`;

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
        } catch (error) {
            console.error('Error in getNeighborhoodStats:', error);
            return {
                total_streets: 0,
                blooming_count: 0,
                unknown_count: 0,
                last_updated: null,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        } finally {
            // Reset statement timeout to default
            try {
                await client.query('RESET statement_timeout');
            } catch (error) {
                console.error('Error resetting statement timeout:', error);
            }
            client.release();
        }
    }

    async getRecentReports(limit: number = 10): Promise<any[]> {
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