interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export const cache = {
    set: <T>(key: string, data: T): void => {
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(entry));
    },

    get: <T>(key: string): T | null => {
        const entryStr = localStorage.getItem(key);
        if (!entryStr) return null;

        const entry: CacheEntry<T> = JSON.parse(entryStr);
        if (Date.now() - entry.timestamp > CACHE_DURATION) {
            localStorage.removeItem(key);
            return null;
        }

        return entry.data;
    },

    clear: (): void => {
        localStorage.clear();
    }
}; 