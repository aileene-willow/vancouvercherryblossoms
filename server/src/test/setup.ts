import dotenv from 'dotenv';

// Load environment variables based on TEST_ENV
const env = process.env.TEST_ENV || 'local';
const envFile = env === 'production' ? '.env.production' : '.env.development';

console.log(`Loading test configuration from ${envFile} for environment: ${env}`);
dotenv.config({ path: envFile });

// Add any global test setup here
beforeAll(async () => {
  console.log('Test Environment:', process.env.TEST_ENV);
  console.log('Node Environment:', process.env.NODE_ENV);
  console.log('Database URL exists:', !!process.env.DATABASE_URL);
});

afterAll(async () => {
  // Add any cleanup that needs to run after all tests
}); 