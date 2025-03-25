import request from 'supertest';
import app from '../index';
import { Pool } from 'pg';
import { getTestConfig, getDatabaseConfig } from './config';

describe('Bloom Status API', () => {
  let pool: Pool;
  const config = getTestConfig();

  beforeAll(async () => {
    // Initialize the database connection with environment-specific config
    pool = new Pool(getDatabaseConfig());
  });

  afterAll(async () => {
    // Close the database connection
    await pool.end();
  });

  describe('GET /api/bloom-status/:street', () => {
    it('should return bloom status for a valid street', async () => {
      const response = await request(app)
        .get(`/api/bloom-status/${config.sampleStreet}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status');
    });

    it('should return unknown status for non-existent street', async () => {
      const response = await request(app)
        .get('/api/bloom-status/NonExistentStreet')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({ status: 'unknown' });
    });
  });

  describe('POST /api/bloom-status', () => {
    it('should update bloom status with minimal required data', async () => {
      const minimalData = {
        street: `Test Street ${Date.now()}`,
        status: 'blooming',
        neighborhood: config.sampleNeighborhood
      };

      const response = await request(app)
        .post('/api/bloom-status')
        .send(minimalData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.street).toBe(minimalData.street);
      expect(response.body.status).toBe(minimalData.status);
    });

    it('should update bloom status with full data', async () => {
      const fullData = {
        street: `Test Street ${Date.now()}`,
        status: 'blooming',
        neighborhood: config.sampleNeighborhood,
        latitude: config.coordinates.latitude,
        longitude: config.coordinates.longitude,
        treeCount: 5
      };

      const response = await request(app)
        .post('/api/bloom-status')
        .send(fullData)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.street).toBe(fullData.street);
      expect(response.body.status).toBe(fullData.status);
      expect(response.body.latitude).toBe(fullData.latitude);
      expect(response.body.longitude).toBe(fullData.longitude);
      expect(response.body.treeCount).toBe(fullData.treeCount);
    });

    it('should reject invalid status values', async () => {
      const invalidData = {
        street: `Test Street ${Date.now()}`,
        status: 'invalid-status',
        neighborhood: config.sampleNeighborhood
      };

      await request(app)
        .post('/api/bloom-status')
        .send(invalidData)
        .expect(400);
    });
  });

  describe('GET /api/bloom-status/stats/:neighborhood', () => {
    const TEST_TIMEOUT = 5000; // 5 seconds timeout

    it('should return neighborhood stats within timeout', async () => {
      const response = await request(app)
        .get(`/api/bloom-status/stats/${config.sampleNeighborhood}`)
        .timeout(TEST_TIMEOUT)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('total_streets');
      expect(response.body).toHaveProperty('blooming_count');
      expect(response.body).toHaveProperty('unknown_count');
    }, TEST_TIMEOUT + 1000); // Jest timeout slightly longer than request timeout

    it('should handle non-existent neighborhood', async () => {
      const response = await request(app)
        .get('/api/bloom-status/stats/NonExistentNeighborhood')
        .timeout(TEST_TIMEOUT)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        total_streets: 0,
        blooming_count: 0,
        unknown_count: 0,
        last_updated: null
      });
    }, TEST_TIMEOUT + 1000);
  });
}); 