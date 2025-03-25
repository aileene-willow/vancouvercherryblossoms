"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables based on TEST_ENV
const env = process.env.TEST_ENV || 'local';
const envFile = env === 'production' ? '.env.production' : '.env.development';
console.log(`Loading test configuration from ${envFile} for environment: ${env}`);
dotenv_1.default.config({ path: envFile });
// Add any global test setup here
beforeAll(async () => {
    console.log('Test Environment:', process.env.TEST_ENV);
    console.log('Node Environment:', process.env.NODE_ENV);
    console.log('Database URL exists:', !!process.env.DATABASE_URL);
});
afterAll(async () => {
    // Add any cleanup that needs to run after all tests
});
