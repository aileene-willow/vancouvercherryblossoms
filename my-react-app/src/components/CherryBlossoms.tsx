import React, { useEffect, useState } from 'react';
import TreeMap from './TreeMap';
import NeighborhoodMap from './NeighborhoodMap';
import { cache } from '../utils/cache';
import { bloomStatusService } from '../services/bloomStatusService';
import { BloomStatus, BloomStatusReport } from '../types/bloomStatus';

interface Tree {
    tree_id: string;
    std_street: string;
    genus_name: string;
    species_name: string;
    common_name: string;
    neighbourhood_name: string;
    latitude: number;
    longitude: number;
}

interface NeighborhoodCount {
    name: string;
    count: number;
    hasConfirmedBlooms?: boolean;
    latestBloomReport?: {
        street: string;
        timestamp: string;
    };
    coordinates?: {
        lat: number;
        lng: number;
    };
}

interface StreetCount {
    street: string;
    count: number;
    bloomStatus?: 'blooming' | 'unknown';
    userReport?: {
        status: 'blooming' | 'unknown';
        timestamp: string;
        username: string;
    };
}

const CherryBlossoms: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [neighborhoodCounts, setNeighborhoodCounts] = useState<NeighborhoodCount[]>([]);
    const [hitRecordLimit, setHitRecordLimit] = useState(false);
    const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);
    const [streetCounts, setStreetCounts] = useState<StreetCount[]>([]);
    const [loadingStreets, setLoadingStreets] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [treeLocations, setTreeLocations] = useState<Tree[]>([]);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [selectedStreet, setSelectedStreet] = useState<string | null>(null);
    const [reportStatus, setReportStatus] = useState<'blooming' | null>(null);
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

    useEffect(() => {
        const fetchAllTrees = async () => {
            try {
                // Check cache first
                const cachedData = cache.get<NeighborhoodCount[]>('neighborhood_counts');
                if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
                    console.log('Using cached neighborhood counts:', cachedData);
                    setNeighborhoodCounts(cachedData);
                    setLoading(false);
                    return;
                } else {
                    console.log('Cache is empty or invalid, fetching fresh data');
                }

                const allTrees: Tree[] = [];
                let offset = 0;
                const limit = 100;
                let hasMore = true;
                const MAX_RECORDS = 10000;

                while (hasMore && offset + limit <= MAX_RECORDS) {
                    const params = new URLSearchParams();
                    params.append('limit', limit.toString());
                    params.append('offset', offset.toString());
                    params.append('refine', 'genus_name:PRUNUS');

                    const response = await fetch(
                        'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/public-trees/records?' +
                        params
                    );

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    console.log(`Fetched page ${offset / limit + 1}:`, data);

                    if (!data.results || !Array.isArray(data.results)) {
                        throw new Error('Invalid data format received from API');
                    }

                    // Transform the data to include latitude and longitude from geo_point_2d
                    const transformedTrees = data.results.map((tree: any) => ({
                        ...tree,
                        latitude: tree.geo_point_2d?.lat || 0,
                        longitude: tree.geo_point_2d?.lon || 0
                    }));

                    allTrees.push(...transformedTrees);

                    if (data.results.length < limit) {
                        hasMore = false;
                    } else {
                        offset += limit;
                    }
                }

                if (offset + limit > MAX_RECORDS) {
                    setHitRecordLimit(true);
                }

                // Count trees by neighborhood and check for confirmed blooms
                const neighborhoodMap = new Map<string, NeighborhoodCount>();
                const streetMap = new Map<string, { count: number; lat: number; lng: number }>();

                allTrees.forEach((tree: Tree) => {
                    if (tree.neighbourhood_name) {
                        const neighborhood = tree.neighbourhood_name;
                        if (!neighborhoodMap.has(neighborhood)) {
                            neighborhoodMap.set(neighborhood, {
                                name: neighborhood,
                                count: 0,
                                coordinates: { lat: 0, lng: 0 }
                            });
                        }
                        const data = neighborhoodMap.get(neighborhood)!;
                        data.count++;

                        // Track street data
                        if (tree.std_street) {
                            const streetKey = `${neighborhood}-${tree.std_street}`;
                            if (!streetMap.has(streetKey)) {
                                streetMap.set(streetKey, {
                                    count: 0,
                                    lat: tree.latitude,
                                    lng: tree.longitude
                                });
                                console.log(`Added new street for ${neighborhood}:`, {
                                    street: tree.std_street,
                                    lat: tree.latitude,
                                    lng: tree.longitude
                                });
                            }
                            const streetData = streetMap.get(streetKey)!;
                            streetData.count++;
                        }
                    }
                });

                // Find the street with most trees for each neighborhood
                neighborhoodMap.forEach((data, neighborhood) => {
                    let maxStreetCount = 0;
                    let maxStreetCoords = { lat: 0, lng: 0 };
                    let maxStreetName = '';

                    console.log(`\nProcessing streets for ${neighborhood}:`);
                    // Find street with most trees in this neighborhood
                    streetMap.forEach((streetData, streetKey) => {
                        const [neigh, street] = streetKey.split('-');
                        if (neigh === neighborhood) {
                            console.log(`Found street: ${street}`, {
                                count: streetData.count,
                                lat: streetData.lat,
                                lng: streetData.lng
                            });
                            if (streetData.count > maxStreetCount) {
                                maxStreetCount = streetData.count;
                                maxStreetCoords = {
                                    lat: streetData.lat,
                                    lng: streetData.lng
                                };
                                maxStreetName = street;
                            }
                        }
                    });

                    // Set the coordinates to the street with most trees
                    data.coordinates = maxStreetCoords;
                    console.log(`\nSelected coordinates for ${neighborhood}:`, {
                        street: maxStreetName,
                        count: maxStreetCount,
                        lat: data.coordinates.lat,
                        lng: data.coordinates.lng
                    });
                });

                // Fetch bloom status for each neighborhood
                const neighborhoods = Array.from(neighborhoodMap.keys());
                for (const neighborhood of neighborhoods) {
                    try {
                        console.log(`\nProcessing neighborhood: ${neighborhood}`);
                        const stats = await bloomStatusService.getNeighborhoodStats(neighborhood);
                        console.log(`\n==== Processing ${neighborhood} ====`);
                        console.log(`Raw stats for ${neighborhood}:`, {
                            total_streets: stats.total_streets,
                            blooming_count: stats.blooming_count,
                            unknown_count: stats.unknown_count
                        });

                        const neighborhoodData = neighborhoodMap.get(neighborhood)!;

                        // Ensure counts are numbers
                        const bloomingCount = Number(stats.blooming_count);
                        const unknownCount = Number(stats.unknown_count);
                        const totalStreets = Number(stats.total_streets);

                        console.log(`\nProcessed counts for ${neighborhood}:`, {
                            bloomingCount,
                            unknownCount,
                            totalStreets,
                            isBloomingNumber: !isNaN(bloomingCount),
                            isUnknownNumber: !isNaN(unknownCount),
                            isTotalStreetsNumber: !isNaN(totalStreets)
                        });

                        // Determine neighborhood status based on the new rules
                        let hasConfirmedBlooms: boolean | undefined;
                        if (bloomingCount > 0) {
                            // Rule 1: If at least one street is blooming, neighborhood is blooming
                            hasConfirmedBlooms = true;
                            console.log(`\n${neighborhood} Status: BLOOMING`, {
                                reason: "At least one street is blooming",
                                bloomingCount
                            });
                        } else {
                            // Rule 2: Otherwise, status is unknown
                            hasConfirmedBlooms = undefined;
                            console.log(`\n${neighborhood} Status: UNKNOWN`, {
                                reason: "No confirmed blooming streets",
                                bloomingCount,
                                unknownCount,
                                totalStreets
                            });
                        }

                        neighborhoodData.hasConfirmedBlooms = hasConfirmedBlooms;

                        console.log(`\nFinal status for ${neighborhood}:`, {
                            name: neighborhoodData.name,
                            hasConfirmedBlooms,
                            bloomingCount,
                            unknownCount,
                            totalStreets,
                            coordinates: neighborhoodData.coordinates
                        });

                        // Get the latest bloom report for this neighborhood
                        let latestBloomReport: BloomStatusReport | null = null;
                        try {
                            const recentReports = await bloomStatusService.getRecentReports(1);
                            if (Array.isArray(recentReports) && recentReports.length > 0) {
                                const foundReport = recentReports.find(report =>
                                    report.neighborhood === neighborhood &&
                                    report.status === 'blooming'
                                );
                                if (foundReport) {
                                    latestBloomReport = foundReport;
                                }
                            } else {
                                console.log('No recent reports available or invalid response:', recentReports);
                            }
                        } catch (error) {
                            console.error('Error fetching recent reports:', error);
                        }

                        if (latestBloomReport) {
                            console.log(`\nFound latest bloom report for ${neighborhood}:`, {
                                report: latestBloomReport,
                                street: latestBloomReport.street,
                                timestamp: latestBloomReport.timestamp
                            });
                            neighborhoodData.latestBloomReport = {
                                street: latestBloomReport.street,
                                timestamp: latestBloomReport.timestamp
                            };
                        } else {
                            console.log(`\nNo bloom report found for ${neighborhood}`);
                        }

                        console.log(`\nFinal neighborhood data for ${neighborhood}:`, {
                            name: neighborhoodData.name,
                            hasConfirmedBlooms: neighborhoodData.hasConfirmedBlooms,
                            latestBloomReport: neighborhoodData.latestBloomReport,
                            bloomingCount,
                            unknownCount,
                            totalStreets
                        });
                    } catch (error) {
                        console.error(`Error fetching bloom stats for ${neighborhood}:`, error);
                        // Set to undefined on error to indicate unknown status
                        const neighborhoodData = neighborhoodMap.get(neighborhood)!;
                        console.log(`Setting hasConfirmedBlooms to undefined for ${neighborhood} due to error`);
                        neighborhoodData.hasConfirmedBlooms = undefined;
                        neighborhoodData.latestBloomReport = undefined;
                    }
                }

                // Convert to array and sort by count
                const sortedNeighborhoods = Array.from(neighborhoodMap.values())
                    .sort((a, b) => b.count - a.count);

                console.log('\nBefore setting state - Neighborhood data:',
                    sortedNeighborhoods.map(n => ({
                        name: n.name,
                        hasConfirmedBlooms: n.hasConfirmedBlooms,
                        count: n.count,
                        coordinates: n.coordinates
                    }))
                );

                // Set the state first
                setNeighborhoodCounts(sortedNeighborhoods);

                // Then cache the processed data
                try {
                    console.log('\nBefore caching - Checking cache contents:');
                    const existingCache = cache.get<NeighborhoodCount[]>('neighborhood_counts');
                    console.log('Existing cache:', existingCache?.map(n => ({
                        name: n.name,
                        hasConfirmedBlooms: n.hasConfirmedBlooms,
                        count: n.count,
                        coordinates: n.coordinates
                    })));

                    cache.set('neighborhood_counts', sortedNeighborhoods);

                    console.log('\nAfter caching - Verifying cache contents:');
                    const cachedData = cache.get<NeighborhoodCount[]>('neighborhood_counts');
                    console.log('Cached data:', cachedData?.map(n => ({
                        name: n.name,
                        hasConfirmedBlooms: n.hasConfirmedBlooms,
                        count: n.count,
                        coordinates: n.coordinates
                    })));
                } catch (err) {
                    console.warn('Failed to cache neighborhood counts:', err);
                }

                setLoading(false);
            } catch (err) {
                console.error('Error fetching data:', err);
                setError(err instanceof Error ? err.message : 'Failed to fetch tree data');
                setLoading(false);
            }
        };

        setLoading(true);
        fetchAllTrees();
    }, []);

    // Load cached bloom reports on component mount
    useEffect(() => {
        const cachedReports = cache.get<{ [key: string]: StreetCount }>('bloom_reports');
        if (cachedReports) {
            console.log('Using cached bloom reports');
            // Update street counts with cached reports
            setStreetCounts(prev =>
                prev.map(street => ({
                    ...street,
                    bloomStatus: cachedReports[street.street]?.bloomStatus || street.bloomStatus,
                    userReport: cachedReports[street.street]?.userReport || street.userReport
                }))
            );
        }
    }, []);

    const fetchStreetCounts = async (neighborhood: string) => {
        try {
            setLoadingStreets(true);
            console.log('Fetching street counts for neighborhood:', neighborhood);

            // Check cache first
            const streetCountsCacheKey = `street_counts_${neighborhood}`;
            const treeLocationsCacheKey = `tree_locations_${neighborhood}`;
            const cachedStreetCounts = cache.get<StreetCount[]>(streetCountsCacheKey);
            const cachedTreeLocations = cache.get<Tree[]>(treeLocationsCacheKey);

            if (cachedStreetCounts && cachedTreeLocations) {
                console.log('Using cached data for', neighborhood, {
                    streetCounts: cachedStreetCounts.length,
                    treeLocations: cachedTreeLocations.length,
                    sampleTree: cachedTreeLocations[0]
                });
                setStreetCounts(cachedStreetCounts);
                setTreeLocations(cachedTreeLocations);
                setLoadingStreets(false);
                return;
            }

            const allTrees: Tree[] = [];
            let offset = 0;
            const limit = 100;
            let hasMore = true;

            // Handle special neighborhood names
            let normalizedNeighborhood = neighborhood;
            if (neighborhood === 'MOUNT PLEASANT' || neighborhood === 'MT PLEASANT') {
                normalizedNeighborhood = 'MOUNT PLEASANT';
            }

            console.log('Normalized neighborhood name:', {
                original: neighborhood,
                normalized: normalizedNeighborhood
            });

            while (hasMore) {
                const params = new URLSearchParams();
                params.append('limit', limit.toString());
                params.append('offset', offset.toString());

                // Properly encode the neighborhood name for the API
                const encodedNeighborhood = normalizedNeighborhood.replace(/'/g, "''"); // Handle single quotes
                const whereClause = `genus_name = 'PRUNUS' AND neighbourhood_name = '${encodedNeighborhood}'`;
                params.append('where', whereClause);
                params.append('select', 'tree_id,std_street,genus_name,species_name,common_name,neighbourhood_name,geo_point_2d');

                const url = 'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/public-trees/records?' + params.toString();
                console.log('API Request:', {
                    originalNeighborhood: neighborhood,
                    normalizedNeighborhood,
                    encodedNeighborhood,
                    whereClause,
                    url,
                    offset,
                    limit
                });

                const response = await fetch(url);
                const responseText = await response.text();
                console.log('Raw API Response:', responseText);

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}, body: ${responseText}`);
                }

                let data;
                try {
                    data = JSON.parse(responseText);
                } catch (e) {
                    console.error('Failed to parse API response:', e);
                    throw new Error('Invalid JSON response from API');
                }

                console.log('Parsed API Response:', {
                    total_count: data.total_count,
                    results_count: data.results?.length,
                    first_result: data.results?.[0],
                    sample_geo_point: data.results?.[0]?.geo_point_2d
                });

                if (!data.results || !Array.isArray(data.results)) {
                    console.warn('No results returned from API');
                    break;
                }

                if (data.results.length === 0) {
                    console.warn('Empty results array returned from API');
                    break;
                }

                // Transform the data to include latitude and longitude from geo_point_2d
                const transformedTrees = data.results.map((tree: any) => {
                    // Log raw tree data for debugging
                    console.log('Processing raw tree data:', {
                        tree_id: tree.tree_id,
                        street: tree.std_street,
                        neighborhood: tree.neighbourhood_name,
                        geo_point_2d: tree.geo_point_2d,
                        raw_lat: tree.geo_point_2d?.lat,
                        raw_lon: tree.geo_point_2d?.lon
                    });

                    // Ensure we have the required fields
                    if (!tree.tree_id || !tree.std_street || !tree.geo_point_2d) {
                        console.log('Skipping tree with missing required fields:', tree);
                        return null;
                    }

                    const lat = tree.geo_point_2d?.lat;
                    const lon = tree.geo_point_2d?.lon;

                    // Validate coordinates
                    const isValidLat = typeof lat === 'number' && !isNaN(lat);
                    const isValidLon = typeof lon === 'number' && !isNaN(lon);
                    const isInBounds = isValidLat && isValidLon &&
                        lat >= 49.1 && lat <= 49.4 &&
                        lon >= -123.3 && lon <= -122.9;

                    if (!isValidLat || !isValidLon || !isInBounds) {
                        console.log('Invalid coordinates:', {
                            tree_id: tree.tree_id,
                            street: tree.std_street,
                            raw_coords: tree.geo_point_2d,
                            lat,
                            lon,
                            isValidLat,
                            isValidLon,
                            isInBounds,
                            bounds: {
                                lat_range: [49.1, 49.4],
                                lon_range: [-123.3, -122.9]
                            }
                        });
                        return null;
                    }

                    const transformedTree = {
                        ...tree,
                        latitude: lat,
                        longitude: lon
                    };

                    console.log('Successfully transformed tree:', {
                        tree_id: transformedTree.tree_id,
                        street: transformedTree.std_street,
                        latitude: transformedTree.latitude,
                        longitude: transformedTree.longitude
                    });

                    return transformedTree;
                }).filter(Boolean);

                console.log('Transformed trees batch:', {
                    original_count: data.results.length,
                    valid_count: transformedTrees.length,
                    first_valid_tree: transformedTrees[0],
                    has_std_street: transformedTrees.some((t: Tree) => t.std_street)
                });

                allTrees.push(...transformedTrees);

                if (data.results.length < limit) {
                    hasMore = false;
                } else {
                    offset += limit;
                }
            }

            console.log('Final tree collection:', {
                neighborhood: normalizedNeighborhood,
                total_trees: allTrees.length,
                sample_trees: allTrees.slice(0, 3).map(tree => ({
                    tree_id: tree.tree_id,
                    street: tree.std_street,
                    lat: tree.latitude,
                    lon: tree.longitude
                }))
            });

            if (allTrees.length === 0) {
                console.warn(`No valid trees found for neighborhood: ${normalizedNeighborhood}. This might be due to:
                1. Incorrect neighborhood name format
                2. No trees in the database
                3. Invalid coordinates in the data
                
                Original neighborhood: ${neighborhood}
                Normalized neighborhood: ${normalizedNeighborhood}`);
                setLoadingStreets(false);
                return;
            }

            // Update the street mapping to include bloom status
            const streetMap = new Map<string, StreetCount>();
            allTrees.forEach((tree: Tree) => {
                if (tree.std_street) {
                    const street = tree.std_street;
                    if (!streetMap.has(street)) {
                        streetMap.set(street, {
                            street,
                            count: 0,
                            bloomStatus: 'unknown'
                        });
                    }
                    streetMap.get(street)!.count++;
                }
            });

            console.log('Street map created:', {
                total_streets: streetMap.size,
                street_counts: Array.from(streetMap.entries()).map(([street, data]) => ({
                    street,
                    count: data.count
                }))
            });

            // Fetch latest bloom status for each street
            const streets = Array.from(streetMap.keys());
            console.log('Fetching bloom status for streets:', streets);

            const bloomStatusPromises = streets.map(async (street) => {
                try {
                    console.log('Fetching status for street:', street);
                    const status = await bloomStatusService.getStatus(street);
                    console.log('Received status for street:', street, 'status:', status);
                    if (status) {
                        const streetData = streetMap.get(street);
                        if (streetData) {
                            streetData.bloomStatus = status.status;
                            streetData.userReport = {
                                status: status.status,
                                timestamp: status.timestamp,
                                username: status.reporter
                            };
                            console.log('Updated street data:', streetData);
                        }
                    }
                } catch (error) {
                    console.error(`Error fetching bloom status for ${street}:`, error);
                }
            });

            await Promise.all(bloomStatusPromises);

            // Store all streets in state but only display top 10 in table
            const allStreets = Array.from(streetMap.values());
            const top10Streets = allStreets
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            console.log('Final sorted streets with bloom status:', {
                total: allStreets.length,
                top10: top10Streets
            });
            console.log('Total trees found:', allTrees.length);

            // Set both the street counts (all streets) and tree locations
            console.log('Setting tree locations:', {
                total_trees: allTrees.length,
                sample_trees: allTrees.slice(0, 3).map(tree => ({
                    tree_id: tree.tree_id,
                    street: tree.std_street,
                    lat: tree.latitude,
                    lon: tree.longitude
                }))
            });
            setStreetCounts(allStreets);
            setTreeLocations(allTrees);

            // Cache both the street counts and tree locations
            try {
                cache.set(streetCountsCacheKey, allStreets);
                cache.set(treeLocationsCacheKey, allTrees);
                console.log('Cached data for', neighborhood, {
                    streetCounts: allStreets.length,
                    treeLocations: allTrees.length,
                    sampleTree: allTrees[0]
                });
            } catch (err) {
                console.warn('Failed to cache data:', err);
            }

            setLoadingStreets(false);
        } catch (err) {
            console.error('Error fetching street data:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch street data');
            setLoadingStreets(false);
        }
    };

    const handleNeighborhoodClick = (neighborhood: string) => {
        console.log('Neighborhood clicked:', neighborhood);
        setSelectedNeighborhood(neighborhood);
        setStreetCounts([]); // Clear previous street data
        setTreeLocations([]); // Clear previous tree locations
        setIsModalOpen(true); // Open modal immediately
        fetchStreetCounts(neighborhood);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedNeighborhood(null);
    };

    const handleReportClick = (street: string, event: React.MouseEvent) => {
        event.stopPropagation();
        setActiveDropdown(activeDropdown === street ? null : street);
    };

    const handleReportSubmit = async (street: string, status: 'blooming') => {
        try {
            console.log('Submitting report for street:', street, 'status:', status);

            // Find the street's data
            const streetData = streetCounts.find(s => s.street === street);
            if (!streetData) {
                console.error('No street data found for:', street);
                return;
            }

            // Calculate average coordinates from tree locations
            const streetTrees = treeLocations.filter(tree => tree.std_street === street);
            const avgLat = streetTrees.reduce((sum, tree) => sum + tree.latitude, 0) / streetTrees.length;
            const avgLng = streetTrees.reduce((sum, tree) => sum + tree.longitude, 0) / streetTrees.length;

            // Create the report
            const report = {
                street,
                status,
                timestamp: new Date().toISOString(),
                reporter: 'Anonymous',
                neighborhood: selectedNeighborhood || '',
                latitude: avgLat,
                longitude: avgLng,
                treeCount: streetData.count
            };

            console.log('Sending report to API:', report);
            await bloomStatusService.updateStatus(report);
            console.log('Status update successful');

            // Update local state
            const updatedStreets = streetCounts.map(s => {
                if (s.street === street) {
                    return {
                        ...s,
                        bloomStatus: status,
                        userReport: {
                            status,
                            timestamp: new Date().toISOString(),
                            username: 'Anonymous'
                        }
                    };
                }
                return s;
            });

            setStreetCounts(updatedStreets);

            // Cache the bloom reports
            const cachedReports = cache.get<{ [key: string]: StreetCount }>('bloom_reports') || {};
            const updatedReports = {
                ...cachedReports,
                [street]: {
                    street,
                    count: streetData.count,
                    bloomStatus: status,
                    userReport: {
                        status,
                        timestamp: new Date().toISOString(),
                        username: 'Anonymous'
                    }
                }
            };
            cache.set('bloom_reports', updatedReports);

            setActiveDropdown(null);
        } catch (error) {
            console.error('Error updating status:', error);
            // Revert the dropdown
            setActiveDropdown(null);
        }
    };

    const getBloomStatusIcon = (status: 'blooming' | 'unknown') => {
        switch (status) {
            case 'blooming':
                return '🌸';
            default:
                return <span className="unknown-status">❓</span>;
        }
    };

    // Add click handler to close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (activeDropdown) {
                setActiveDropdown(null);
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [activeDropdown]);

    const handleMapStatusUpdate = async (street: string, status: 'blooming' | 'unknown') => {
        try {
            console.log('Map status update received for street:', street, 'status:', status);

            // Find the street's data
            const streetData = streetCounts.find(s => s.street === street);
            if (!streetData) {
                console.error('No street data found for:', street);
                return;
            }

            // Calculate average coordinates from tree locations
            const streetTrees = treeLocations.filter(tree => tree.std_street === street);
            const avgLat = streetTrees.reduce((sum, tree) => sum + tree.latitude, 0) / streetTrees.length;
            const avgLng = streetTrees.reduce((sum, tree) => sum + tree.longitude, 0) / streetTrees.length;

            // Create the report
            const report = {
                street,
                status: status as 'blooming',
                timestamp: new Date().toISOString(),
                reporter: 'Anonymous',
                neighborhood: selectedNeighborhood || '',
                latitude: avgLat,
                longitude: avgLng,
                treeCount: streetData.count
            };

            console.log('Sending report to API:', report);
            const updatedReport = await bloomStatusService.updateStatus(report);
            console.log('Status update successful:', updatedReport);

            // Update local state immediately
            const updatedStreets = streetCounts.map(s => {
                if (s.street === street) {
                    return {
                        ...s,
                        bloomStatus: status,
                        userReport: {
                            status: status as 'blooming',
                            timestamp: new Date().toISOString(),
                            username: 'Anonymous'
                        }
                    };
                }
                return s;
            });

            setStreetCounts(updatedStreets);

            // Update neighborhood stats immediately
            if (selectedNeighborhood) {
                try {
                    console.log(`\n==== Updating ${selectedNeighborhood} after status change ====`);
                    const stats = await bloomStatusService.getNeighborhoodStats(selectedNeighborhood);
                    console.log(`Raw updated stats for ${selectedNeighborhood}:`, {
                        total_streets: stats.total_streets,
                        blooming_count: stats.blooming_count,
                        unknown_count: stats.unknown_count
                    });

                    const bloomingCount = Number(stats.blooming_count);
                    const unknownCount = Number(stats.unknown_count);
                    const totalStreets = Number(stats.total_streets);

                    console.log(`\nProcessed counts for ${selectedNeighborhood}:`, {
                        bloomingCount,
                        unknownCount,
                        totalStreets,
                        isBloomingNumber: !isNaN(bloomingCount),
                        isUnknownNumber: !isNaN(unknownCount),
                        isTotalStreetsNumber: !isNaN(totalStreets)
                    });

                    // Determine neighborhood status based on the new rules
                    let hasConfirmedBlooms: boolean | undefined;
                    if (bloomingCount > 0) {
                        hasConfirmedBlooms = true;
                        console.log(`\n${selectedNeighborhood} Updated Status: BLOOMING`, {
                            reason: "At least one street is blooming",
                            bloomingCount
                        });
                    } else {
                        hasConfirmedBlooms = undefined;
                        console.log(`\n${selectedNeighborhood} Updated Status: UNKNOWN`, {
                            reason: "No confirmed blooming streets",
                            bloomingCount,
                            unknownCount,
                            totalStreets
                        });
                    }

                    // Get the latest bloom report for this neighborhood
                    let latestBloomReport: BloomStatusReport | null = null;
                    try {
                        const recentReports = await bloomStatusService.getRecentReports(1);
                        if (Array.isArray(recentReports) && recentReports.length > 0) {
                            const foundReport = recentReports.find(report =>
                                report.neighborhood === selectedNeighborhood &&
                                report.status === 'blooming'
                            );
                            if (foundReport) {
                                latestBloomReport = foundReport;
                            }
                        } else {
                            console.log('No recent reports available or invalid response:', recentReports);
                        }
                    } catch (error) {
                        console.error('Error fetching recent reports:', error);
                    }

                    // Update neighborhood counts with a new object to ensure state change
                    setNeighborhoodCounts(prev => {
                        const updatedNeighborhoods = prev.map(neighborhood => {
                            if (neighborhood.name === selectedNeighborhood) {
                                const updatedNeighborhood = {
                                    ...neighborhood,
                                    hasConfirmedBlooms,
                                    latestBloomReport: latestBloomReport ? {
                                        street: latestBloomReport.street,
                                        timestamp: latestBloomReport.timestamp
                                    } : undefined
                                };
                                console.log(`Updated neighborhood data for ${selectedNeighborhood}:`, updatedNeighborhood);
                                return updatedNeighborhood;
                            }
                            return neighborhood;
                        });
                        console.log('Updated neighborhood counts:', updatedNeighborhoods);
                        return updatedNeighborhoods;
                    });
                } catch (error) {
                    console.error('Error updating neighborhood stats:', error);
                }
            }

            // Cache the bloom reports
            const cachedReports = cache.get<{ [key: string]: StreetCount }>('bloom_reports') || {};
            const updatedReports = {
                ...cachedReports,
                [street]: {
                    street,
                    count: streetData.count,
                    bloomStatus: status,
                    userReport: {
                        status: status as 'blooming',
                        timestamp: new Date().toISOString(),
                        username: 'Anonymous'
                    }
                }
            };
            cache.set('bloom_reports', updatedReports);

            // Also update the street counts cache for the current neighborhood
            if (selectedNeighborhood) {
                const streetCountsCacheKey = `street_counts_${selectedNeighborhood}`;
                const currentCachedStreetCounts = cache.get<StreetCount[]>(streetCountsCacheKey);
                if (currentCachedStreetCounts) {
                    const updatedCachedStreetCounts = currentCachedStreetCounts.map(s => {
                        if (s.street === street) {
                            return {
                                ...s,
                                bloomStatus: status,
                                userReport: {
                                    status: status as 'blooming',
                                    timestamp: new Date().toISOString(),
                                    username: 'Anonymous'
                                }
                            };
                        }
                        return s;
                    });
                    cache.set(streetCountsCacheKey, updatedCachedStreetCounts);
                }
            }
        } catch (error) {
            console.error('Error updating status:', error);
        }
    };

    if (error) return (
        <div className="cherry-blossoms">
            <div className="error">
                <h3>Error Loading Data</h3>
                <p>{error}</p>
                <p>Please try refreshing the page.</p>
            </div>
        </div>
    );

    return (
        <div className="cherry-blossoms">
            {loading ? (
                <div className="loading">
                    <div className="sakura-icon">🌸</div>
                    <p>Loading cherry blossom data...</p>
                </div>
            ) : (
                <>
                    {hitRecordLimit && (
                        <div className="record-limit-warning">
                            Note: Due to API limitations, we can only show the first 10,000 cherry blossom trees.
                            The actual numbers may be higher.
                        </div>
                    )}
                    <div className="neighborhood-map-section">
                        <p className="map-instructions">
                            Click on any marker to view neighborhood details and report bloom status.
                        </p>
                        <NeighborhoodMap
                            neighborhoods={neighborhoodCounts}
                            onNeighborhoodClick={handleNeighborhoodClick}
                        />
                    </div>

                    {isModalOpen && (
                        <div className="modal-overlay" onClick={handleCloseModal}>
                            <div className="modal" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3 className="modal-title">
                                        Cherry Blossom Trees in {selectedNeighborhood}
                                    </h3>
                                    <button className="modal-close" onClick={handleCloseModal}>×</button>
                                </div>
                                {loadingStreets ? (
                                    <div className="modal-loading">
                                        <div className="modal-loading-spinner"></div>
                                        <p className="modal-loading-text">Loading street data...</p>
                                    </div>
                                ) : (
                                    <div className="map-container">
                                        <div className="map-legend" style={{
                                            display: 'flex',
                                            justifyContent: 'center',
                                        }}>
                                            <div className="legend-item">
                                                <div className="legend-color confirmed"></div>
                                                <span className="legend-label">Confirmed Blooms</span>
                                            </div>
                                            <div className="legend-item">
                                                <div className="legend-color unknown"></div>
                                                <span className="legend-label">Unknown Bloom Status</span>
                                            </div>
                                        </div>
                                        <p className="map-instructions">
                                            Click on any marker to view the street and report bloom status.
                                        </p>
                                        <TreeMap
                                            trees={treeLocations}
                                            neighborhood={selectedNeighborhood || ''}
                                            onStatusUpdate={handleMapStatusUpdate}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Report Modal */}
                    {isReportModalOpen && (
                        <div className="modal-overlay" onClick={() => setIsReportModalOpen(false)}>
                            <div className="modal report-modal" onClick={e => e.stopPropagation()}>
                                <div className="modal-header">
                                    <h3>Report Bloom Status</h3>
                                    <button className="modal-close" onClick={() => setIsReportModalOpen(false)}>×</button>
                                </div>
                                <div className="modal-content">
                                    <p>Street: <strong>{selectedStreet}</strong></p>
                                    <div className="report-options">
                                        <button
                                            className={`report-option ${reportStatus === 'blooming' ? 'selected' : ''}`}
                                            onClick={() => setReportStatus('blooming')}
                                        >
                                            🌸 Blooming
                                        </button>
                                    </div>
                                    <button
                                        className="submit-report"
                                        onClick={() => handleReportSubmit(selectedStreet || '', reportStatus || 'blooming')}
                                        disabled={!reportStatus}
                                    >
                                        Submit Report
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default CherryBlossoms; 