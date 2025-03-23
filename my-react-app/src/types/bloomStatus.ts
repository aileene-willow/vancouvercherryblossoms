export type BloomStatus = 'blooming' | 'unknown';

export interface BloomStatusReport {
    id: string;
    street: string;
    status: BloomStatus;
    timestamp: string;
    reporter: string;
    neighborhood: string;
    latitude: number;
    longitude: number;
    treeCount: number;
}

export interface BloomStatusStats {
    total_streets: number;
    blooming_count: number;
    unknown_count: number;
    last_updated: string;
} 