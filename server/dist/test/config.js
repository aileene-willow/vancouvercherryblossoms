"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDatabaseConfig = exports.getTestConfig = void 0;
const configs = {
    local: {
        sampleStreet: 'Burrard Street',
        sampleNeighborhood: 'Downtown',
        coordinates: {
            latitude: 49.2827,
            longitude: -123.1207
        }
    },
    production: {
        sampleStreet: 'Burrard Street',
        sampleNeighborhood: 'Downtown',
        coordinates: {
            latitude: 49.2827,
            longitude: -123.1207
        }
    }
};
const getTestConfig = () => {
    const env = process.env.TEST_ENV || 'local';
    if (!configs[env]) {
        throw new Error(`No test configuration found for environment: ${env}`);
    }
    return configs[env];
};
exports.getTestConfig = getTestConfig;
const getDatabaseConfig = () => {
    return {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? {
            rejectUnauthorized: false
        } : undefined,
        max: 5,
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: 5000
    };
};
exports.getDatabaseConfig = getDatabaseConfig;
