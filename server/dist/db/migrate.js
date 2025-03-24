"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv_1.default.config({ path: envFile });
async function migrate() {
    const pool = new pg_1.Pool({
        connectionString: process.env.DATABASE_URL
    });
    try {
        // Read the schema file
        const schemaPath = path_1.default.join(__dirname, 'schema.sql');
        const schema = fs_1.default.readFileSync(schemaPath, 'utf8');
        // Execute the schema
        await pool.query(schema);
        console.log('Database schema created successfully');
        // Close the pool
        await pool.end();
    }
    catch (error) {
        console.error('Error creating database schema:', error);
        process.exit(1);
    }
}
migrate();
