import { BloomStatus, BloomStatusReport, BloomStatusStats } from '../types/bloomStatus';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001/api';

const defaultOptions: RequestInit = {
    mode: 'cors',
    credentials: 'omit',
    headers: {
        'Content-Type': 'application/json'
    }
};

export const bloomStatusService = {
    async getStatus(street: string): Promise<BloomStatusReport | null> {
        try {
            const response = await fetch(
                `${API_BASE_URL}/bloom-status/${encodeURIComponent(street)}`,
                defaultOptions
            );
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error('Failed to fetch bloom status');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching bloom status:', error);
            return null;
        }
    },

    async updateStatus(report: Omit<BloomStatusReport, 'id'>): Promise<BloomStatusReport> {
        console.log('Updating status:', report);
        try {
            const response = await fetch(`${API_BASE_URL}/bloom-status`, {
                ...defaultOptions,
                method: 'POST',
                body: JSON.stringify(report),
            });

            console.log('Response status:', response.status);
            if (!response.ok) {
                const errorData = await response.json();
                if (response.status === 429) {
                    const retryAfter = errorData.retryAfter || 60;
                    throw new Error(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`);
                }
                throw new Error(errorData.error || 'Failed to update bloom status');
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error in updateStatus:', error);
            throw error;
        }
    },

    async getNeighborhoodStats(neighborhood: string): Promise<BloomStatusStats> {
        try {
            const response = await fetch(
                `${API_BASE_URL}/bloom-status/stats/${encodeURIComponent(neighborhood)}`,
                defaultOptions
            );
            if (!response.ok) throw new Error('Failed to fetch neighborhood stats');
            return await response.json();
        } catch (error) {
            console.error('Error fetching neighborhood stats:', error);
            throw error;
        }
    },

    async getRecentReports(limit: number = 10): Promise<BloomStatusReport[]> {
        try {
            const response = await fetch(
                `${API_BASE_URL}/bloom-status/recent?limit=${limit}`,
                defaultOptions
            );
            if (!response.ok) throw new Error('Failed to fetch recent reports');
            return await response.json();
        } catch (error) {
            console.error('Error fetching recent reports:', error);
            throw error;
        }
    }
}; 