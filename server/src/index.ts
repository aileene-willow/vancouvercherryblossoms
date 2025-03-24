import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { BloomStatusDB } from './db/bloomStatus';
import dotenv from 'dotenv';

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: envFile });

// Log environment and database connection info (without exposing sensitive data)
console.log('Environment:', process.env.NODE_ENV);
console.log('Database URL exists:', !!process.env.DATABASE_URL);
console.log('Database URL format:', process.env.DATABASE_URL?.includes('postgres://') ? 'Valid PostgreSQL URL' : 'Invalid URL format');

const app = express();
const port = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5, // Reduce max connections
    idleTimeoutMillis: 10000, // Reduce idle timeout
    connectionTimeoutMillis: 5000, // Increase connection timeout
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
    } : undefined
});

// Initialize database layer
const bloomStatusDB = new BloomStatusDB(pool);

// CORS middleware
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
});

app.use(express.json());

// Rate limiting middleware (20 requests per minute per IP)
const rateLimit = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 20; // Increased from 5 to 20

const rateLimiter = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Only apply rate limiting to POST requests
    if (req.method !== 'POST') {
        return next();
    }

    const ip = req.ip || 'unknown';
    const now = Date.now();

    // Clean up old entries
    for (const [key, value] of rateLimit.entries()) {
        if (now - value.timestamp > RATE_LIMIT_WINDOW) {
            rateLimit.delete(key);
        }
    }

    // Check rate limit
    const userLimit = rateLimit.get(ip);
    if (userLimit) {
        if (now - userLimit.timestamp > RATE_LIMIT_WINDOW) {
            rateLimit.set(ip, { count: 1, timestamp: now });
        } else if (userLimit.count >= RATE_LIMIT_MAX) {
            return res.status(429).json({
                error: 'Too many requests. Please try again later.',
                retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - userLimit.timestamp)) / 1000)
            });
        } else {
            userLimit.count++;
        }
    } else {
        rateLimit.set(ip, { count: 1, timestamp: now });
    }

    next();
};

// Routes
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

app.get('/api', (req, res) => {
    res.json({ status: 'ok', message: 'API is running' });
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
    console.log('Testing database connection...');
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Database URL exists:', !!process.env.DATABASE_URL);
    console.log('Database URL format:', process.env.DATABASE_URL?.includes('postgres://') ? 'Valid' : 'Invalid');
    
    try {
        console.log('Attempting to connect to database...');
        const client = await pool.connect();
        console.log('Successfully connected to database');
        
        try {
            console.log('Executing test query...');
            const result = await client.query('SELECT NOW()');
            console.log('Query result:', result.rows[0]);
            res.json({ status: 'success', timestamp: result.rows[0].now });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Database connection error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Database connection failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });
    }
});

app.get('/api/bloom-status/:street', async (req, res) => {
    try {
        const { street } = req.params;
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), 5000);
        });
        const statusPromise = bloomStatusDB.getStreetStatus(street);
        
        const status = await Promise.race([statusPromise, timeoutPromise]);
        res.json(status || { status: 'unknown' });
    } catch (error) {
        console.error('Error fetching bloom status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/bloom-status', rateLimiter, async (req, res) => {
    try {
        console.log('Received status update request:', req.body);
        const { street, status, neighborhood, latitude, longitude, treeCount } = req.body;

        // Validate status
        if (!['blooming', 'unknown'].includes(status)) {
            console.log('Invalid status received:', status);
            return res.status(400).json({ error: 'Invalid status' });
        }

        console.log('Updating status in database...');
        const result = await bloomStatusDB.updateStatus(
            street,
            status,
            neighborhood,
            latitude,
            longitude,
            treeCount
        );
        console.log('Status update result:', result);
        res.json(result);
    } catch (error) {
        console.error('Error updating bloom status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/bloom-status/stats/:neighborhood', async (req, res) => {
    try {
        const { neighborhood } = req.params;
        const stats = await bloomStatusDB.getNeighborhoodStats(neighborhood);
        res.json(stats);
    } catch (error) {
        console.error('Error fetching neighborhood stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/bloom-status/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const reports = await bloomStatusDB.getRecentReports(limit);
        res.json(reports);
    } catch (error) {
        console.error('Error fetching recent reports:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start server only if not running on Vercel
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

// Export for Vercel
export default app; 