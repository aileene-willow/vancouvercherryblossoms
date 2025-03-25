import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: envFile });

async function migrate() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? {
            rejectUnauthorized: false
        } : undefined
    });

    try {
        // Check if this is initial setup or an update
        const isInitialSetup = await checkInitialSetup(pool);
        
        if (isInitialSetup) {
            // Read and execute the initial schema file
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            await pool.query(schema);
            console.log('Initial database schema created successfully');
        } else {
            // Read and execute the migration file
            const migrationPath = path.join(__dirname, 'migration_v2.sql');
            const migration = fs.readFileSync(migrationPath, 'utf8');
            await pool.query(migration);
            console.log('Database schema updated successfully');
        }

        // Close the pool
        await pool.end();
    } catch (error) {
        console.error('Error updating database schema:', error);
        process.exit(1);
    }
}

async function checkInitialSetup(pool: Pool): Promise<boolean> {
    try {
        const result = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public'
                AND table_name = 'streets'
            );
        `);
        return !result.rows[0].exists;
    } catch (error) {
        console.error('Error checking database state:', error);
        return true; // Assume initial setup if we can't check
    }
}

migrate(); 