import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { BloomStatusDB } from './db/bloomStatus';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables based on NODE_ENV
const NODE_ENV = process.env.NODE_ENV || 'development';
const envFile = NODE_ENV === 'production' ? '.env.production' : '.env.development';
const envPath = path.resolve(process.cwd(), envFile);

console.log('Loading environment from:', envPath);
dotenv.config({ path: envPath });

// Verify environment variables
console.log('Environment:', NODE_ENV);
console.log('Port:', process.env.PORT);
console.log('Database URL exists:', !!process.env.DATABASE_URL);
console.log('Database URL format:', process.env.DATABASE_URL?.includes('postgres'));

const app = express();
const port = process.env.PORT || 3001;

// Database connection
console.log('Initializing database connection...');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3, // Reduce max connections
    idleTimeoutMillis: 30000, // Increase idle timeout to 30 seconds
    connectionTimeoutMillis: 10000, // Increase connection timeout to 10 seconds
    ssl: {
        rejectUnauthorized: false // Required for Supabase connections
    },
    keepAlive: true // Enable keepalive
});

// Test the pool on startup
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
    console.log('New client connected to database');
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
    console.log('Environment:', NODE_ENV);
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

app.get('/api/bloom-status', async (req, res) => {
    try {
        const { street } = req.query;
        if (!street || typeof street !== 'string') {
            return res.status(400).json({ error: 'Street parameter is required' });
        }
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
    const TIMEOUT = 4000; // 4 seconds timeout
    let timer: NodeJS.Timeout | undefined;

    try {
        const { neighborhood } = req.params;
        console.log(`Processing neighborhood: ${neighborhood}`);
        
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            timer = setTimeout(() => {
                console.log(`Request timeout for neighborhood: ${neighborhood}`);
                reject(new Error('Request timeout'));
            }, TIMEOUT);
        });

        // Create the stats promise
        const statsPromise = bloomStatusDB.getNeighborhoodStats(neighborhood);

        // Race between the timeout and the actual query
        const stats = await Promise.race([statsPromise, timeoutPromise]);
        
        // Clear the timeout if the query completes
        if (timer) clearTimeout(timer);
        
        if (stats.error) {
            console.warn(`Warning fetching stats for ${neighborhood}:`, stats.error);
        }
        
        res.json(stats);
    } catch (error: unknown) {
        // Clear the timeout if there's an error
        if (timer) clearTimeout(timer);
        
        console.error('Error fetching neighborhood stats:', error);
        if (error instanceof Error && error.message === 'Request timeout') {
            res.status(504).json({ 
                error: 'Request timeout',
                message: 'The request took too long to process. Please try again.'
            });
        } else {
            res.status(500).json({ 
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
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
if (NODE_ENV !== 'production') {
    const server = app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`Port ${port} is already in use. Please try a different port or kill the process using this port.`);
            process.exit(1);
        } else {
            console.error('Server error:', error);
        }
    });

    // Handle process termination
    process.on('SIGTERM', () => {
        console.log('Received SIGTERM. Closing server...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
}

// Export for Vercel
export default app; 