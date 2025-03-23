import { BloomStatus } from '../types/bloomStatus';

interface StreetData {
    street: string;
    treeCount: number;
    bloomStatus?: BloomStatus;
    lastUpdated?: string;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

const isStatusExpired = (timestamp: string): boolean => {
    const reportDate = new Date(timestamp).getTime();
    const now = new Date().getTime();
    return now - reportDate > ONE_WEEK_MS;
};

export const streetService = {
    async getStreetsWithStatus(neighborhood: string): Promise<StreetData[]> {
        try {
            // First, get all streets with tree counts
            const response = await fetch(`/api/streets?neighborhood=${encodeURIComponent(neighborhood)}`);
            if (!response.ok) throw new Error('Failed to fetch streets');
            const streets = await response.json();

            // Then, get bloom status for each street
            const streetsWithStatus = await Promise.all(
                streets.map(async (street: StreetData) => {
                    try {
                        const statusResponse = await fetch(`/api/bloom-status/${encodeURIComponent(street.street)}`);
                        if (statusResponse.ok) {
                            const statusData = await statusResponse.json();
                            // Check if status is expired
                            if (statusData && statusData.timestamp) {
                                return {
                                    ...street,
                                    bloomStatus: isStatusExpired(statusData.timestamp) ? 'unknown' : statusData.status,
                                    lastUpdated: statusData.timestamp
                                };
                            }
                        }
                    } catch (error) {
                        console.error(`Error fetching status for ${street.street}:`, error);
                    }
                    return {
                        ...street,
                        bloomStatus: 'unknown',
                        lastUpdated: undefined
                    };
                })
            );

            return streetsWithStatus;
        } catch (error) {
            console.error('Error fetching streets with status:', error);
            throw error;
        }
    }
}; 