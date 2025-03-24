import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { BloomStatusDB } from './db/bloomStatus';
import dotenv from 'dotenv';

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: envFile });

const app = express();
const port = process.env.PORT || 3001;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Initialize database layer
const bloomStatusDB = new BloomStatusDB(pool);

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? 'https://aileene-willow.github.io'
        : ['http://localhost:3000', 'https://aileene-willow.github.io'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));
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
app.get('/api/bloom-status/:street', async (req, res) => {
    try {
        const { street } = req.params;
        const status = await bloomStatusDB.getStreetStatus(street);
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