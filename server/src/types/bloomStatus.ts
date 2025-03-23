export type BloomStatus = 'blooming' | 'unknown';

export interface BloomStatusReport {
    street: string;
    status: BloomStatus;
    timestamp: Date;
    neighborhood: string;
    latitude?: number;
    longitude?: number;
    treeCount: number;
} 