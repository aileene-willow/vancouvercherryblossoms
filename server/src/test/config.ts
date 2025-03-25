interface TestConfig {
  sampleStreet: string;
  sampleNeighborhood: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

const configs: Record<string, TestConfig> = {
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

export const getTestConfig = (): TestConfig => {
  const env = process.env.TEST_ENV || 'local';
  if (!configs[env]) {
    throw new Error(`No test configuration found for environment: ${env}`);
  }
  return configs[env];
};

export const getDatabaseConfig = () => {
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