import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BloomStatusReport } from './BloomStatusReport';
import { bloomStatusService } from '../services/bloomStatusService';
import './BloomStatusReport.css';
import './TreeMap.css';

interface Tree {
    tree_id: string;
    std_street: string;
    genus_name: string;
    species_name: string;
    common_name: string;
    neighbourhood_name: string;
    latitude: number;
    longitude: number;
    bloom_status?: 'blooming' | 'unknown';
}

interface TreeMapProps {
    trees: Tree[];
    neighborhood: string;
    onStatusUpdate?: (street: string, status: 'blooming' | 'unknown') => void;
}

interface StreetGroup {
    street: string;
    count: number;
    trees: Tree[];
    bloomStatus?: string;
    lastReport?: {
        timestamp: string;
    };
}

const TreeMap: React.FC<TreeMapProps> = ({ trees, neighborhood, onStatusUpdate }) => {
    const mapRef = useRef<L.Map | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const markersRef = useRef<L.Marker[]>([]);
    const streetStatusRef = useRef<Map<string, string>>(new Map());
    const streetGroupsRef = useRef<Map<string, StreetGroup>>(new Map());
    const rootsRef = useRef<Map<string, ReturnType<typeof createRoot>>>(new Map());
    const [updatedStreet, setUpdatedStreet] = useState<{ street: string, status: string } | null>(null);

    // Create sakura marker icon
    const createSakuraMarkerIcon = (count: number, bloomStatus?: string) => {
        // Use a smaller size for all markers
        const size = 40;
        const center = size / 2;
        const radius = size / 2 - 4;

        // Determine marker color based on bloom status
        console.log('Creating marker icon with status:', bloomStatus);
        const markerColor = bloomStatus === 'blooming' ? '#ff69b4' : '#ffffff';
        const strokeColor = bloomStatus === 'blooming' ? '#ff69b4' : '#ffb7c5';

        const svg = `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
                <g transform="translate(${size / 2}, ${size / 2})">
                    <!-- Location pin shape -->
                    <path d="M0 ${-radius * 0.8}
                           C${radius * 0.4} ${-radius * 0.8}, ${radius * 0.8} ${-radius * 0.4}, ${radius * 0.8} 0
                           C${radius * 0.8} ${radius * 0.4}, ${radius * 0.4} ${radius * 0.8}, 0 ${radius * 0.8}
                           C${-radius * 0.4} ${radius * 0.8}, ${-radius * 0.8} ${radius * 0.4}, ${-radius * 0.8} 0
                           C${-radius * 0.8} ${-radius * 0.4}, ${-radius * 0.4} ${-radius * 0.8}, 0 ${-radius * 0.8}
                           L0 ${radius * 1.2}
                           L${-radius * 0.2} ${radius * 0.8}
                           L0 ${radius * 1.2}
                           L${radius * 0.2} ${radius * 0.8}
                           Z"
                          fill="${markerColor}"
                          stroke="${strokeColor}"
                          stroke-width="1"/>
                    <!-- Count text -->
                    <text x="0" y="${-radius * 0.2}" 
                          text-anchor="middle" 
                          dominant-baseline="middle" 
                          fill="${bloomStatus === 'blooming' ? '#ffffff' : '#d81b60'}" 
                          font-size="12px" 
                          font-weight="bold">
                        ${count}
                    </text>
                </g>
            </svg>
        `;

        console.log('Created marker with colors:', { markerColor, strokeColor, status: bloomStatus });

        const div = document.createElement('div');
        div.innerHTML = svg;
        div.style.width = `${size}px`;
        div.style.height = `${size}px`;
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'center';

        return L.divIcon({
            html: div,
            className: 'sakura-marker',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });
    };

    // Effect to handle marker updates
    useEffect(() => {
        if (updatedStreet) {
            const { street, status } = updatedStreet;
            const streetGroup = streetGroupsRef.current.get(street);
            const marker = markersRef.current.find(m => {
                const popup = m.getPopup();
                if (!popup) return false;
                const content = popup.getContent();
                return typeof content === 'string' && content.includes(street);
            });

            if (marker && streetGroup && mapRef.current) {
                console.log('Updating marker for street:', street, 'with status:', status);

                // Get the marker's current position
                const position = marker.getLatLng();

                // Remove the old marker from the map
                marker.removeFrom(mapRef.current);

                // Create a new marker with the updated icon
                const newIcon = createSakuraMarkerIcon(streetGroup.count, status);
                const newMarker = L.marker(position, {
                    icon: newIcon
                });

                // Copy over the popup from the old marker
                const oldPopup = marker.getPopup();
                if (oldPopup) {
                    newMarker.bindPopup(oldPopup);
                }

                // Add the new marker to the map
                newMarker.addTo(mapRef.current);

                // Update the markers array with the new marker
                const markerIndex = markersRef.current.indexOf(marker);
                if (markerIndex !== -1) {
                    markersRef.current[markerIndex] = newMarker;
                }

                console.log('Marker successfully updated with new status:', status);
            }
            setUpdatedStreet(null);
        }
    }, [updatedStreet]);

    const handleStatusUpdate = async (street: string, status: string) => {
        console.log('handleStatusUpdate called with:', { street, status });
        try {
            // Find the street's data
            const streetGroup = streetGroupsRef.current.get(street);
            console.log('Found street group:', streetGroup);
            if (!streetGroup) {
                console.error('No street group found for:', street);
                return;
            }

            const avgLat = streetGroup.trees.reduce((sum: number, tree: Tree) => sum + tree.latitude, 0) / streetGroup.count;
            const avgLng = streetGroup.trees.reduce((sum: number, tree: Tree) => sum + tree.longitude, 0) / streetGroup.count;

            console.log('Calculated coordinates:', { avgLat, avgLng });

            // Update status in database
            const report = {
                street,
                status: status as 'blooming' | 'unknown',
                timestamp: new Date().toISOString(),
                reporter: 'Anonymous',
                neighborhood,
                latitude: avgLat,
                longitude: avgLng,
                treeCount: streetGroup.count
            };
            console.log('Sending report to API:', report);

            const updatedReport = await bloomStatusService.updateStatus(report);
            console.log('Status update successful:', updatedReport);

            // Update local state
            streetStatusRef.current.set(street, status);
            console.log('Updated local state');

            // Update street group's bloom status
            streetGroup.bloomStatus = status;
            console.log('Updated street group bloom status:', status);

            // Notify parent component with a slight delay to ensure database update is complete
            if (onStatusUpdate) {
                // Add a small delay to ensure the database has processed the update
                setTimeout(() => {
                    onStatusUpdate(street, status as 'blooming' | 'unknown');
                }, 100);
            }

            // Update marker for this street
            const marker = markersRef.current.find(m => {
                const popup = m.getPopup();
                if (!popup) return false;
                const content = popup.getContent();
                return typeof content === 'string' && content.includes(street);
            });
            console.log('Found marker:', marker ? 'yes' : 'no');

            if (marker && mapRef.current) {
                // Get the marker's current position and popup
                const position = marker.getLatLng();
                const oldPopup = marker.getPopup();

                // Remove the old marker from the map
                marker.removeFrom(mapRef.current);

                // Create a new marker with the updated icon
                const newIcon = createSakuraMarkerIcon(streetGroup.count, status);
                const newMarker = L.marker(position, {
                    icon: newIcon
                });

                // Copy over the popup content
                if (oldPopup) {
                    const newContent = `
                        <div style="text-align: center; min-width: 200px;">
                            <strong>${street}</strong><br>
                            ${streetGroup.count} 🌸 trees
                        </div>
                        <div id="status-report-${street.replace(/\s+/g, '-')}"></div>
                    `;
                    newMarker.bindPopup(newContent);
                }

                // Add the new marker to the map
                newMarker.addTo(mapRef.current);

                // Update the markers array
                const markerIndex = markersRef.current.indexOf(marker);
                if (markerIndex !== -1) {
                    markersRef.current[markerIndex] = newMarker;
                }

                // Re-render the BloomStatusReport component
                setTimeout(() => {
                    const container = document.getElementById(`status-report-${street.replace(/\s+/g, '-')}`);
                    if (container) {
                        let root = rootsRef.current.get(street);
                        if (!root) {
                            root = createRoot(container);
                            rootsRef.current.set(street, root);
                        }

                        const statusReport = (
                            <BloomStatusReport
                                street={street}
                                neighborhood={neighborhood}
                                latitude={avgLat}
                                longitude={avgLng}
                                treeCount={streetGroup.count}
                                currentStatus={status as 'blooming' | 'unknown'}
                                onStatusUpdate={(newStatus) => {
                                    console.log('Status update requested from TreeMap:', { street, newStatus });
                                    handleStatusUpdate(street, newStatus);
                                }}
                            />
                        );

                        root.render(statusReport);
                    }
                }, 0);

                // Reattach click handler
                newMarker.on('click', () => {
                    newMarker.openPopup();
                    // Ensure the BloomStatusReport component is rendered
                    const container = document.getElementById(`status-report-${street.replace(/\s+/g, '-')}`);
                    if (container) {
                        let root = rootsRef.current.get(street);
                        if (!root) {
                            root = createRoot(container);
                            rootsRef.current.set(street, root);
                        }

                        const statusReport = (
                            <BloomStatusReport
                                street={street}
                                neighborhood={neighborhood}
                                latitude={avgLat}
                                longitude={avgLng}
                                treeCount={streetGroup.count}
                                currentStatus={status as 'blooming' | 'unknown'}
                                onStatusUpdate={(newStatus) => {
                                    console.log('Status update requested from TreeMap:', { street, newStatus });
                                    handleStatusUpdate(street, newStatus);
                                }}
                            />
                        );

                        root.render(statusReport);
                    }
                });
            }
        } catch (error) {
            console.error('Error updating status:', error);
            // Revert the select value
            const container = document.getElementById(`status-report-${street.replace(/\s+/g, '-')}`);
            if (container) {
                const select = container.querySelector('.status-select') as HTMLSelectElement;
                if (select) {
                    select.value = streetStatusRef.current.get(street) || 'unknown';
                }
            }
        }
    };

    const fetchStreetStatuses = async (streets: string[]) => {
        console.log('Fetching initial statuses for streets:', streets);
        const statusPromises = streets.map(async (street) => {
            try {
                const status = await bloomStatusService.getStatus(street);
                if (status) {
                    streetStatusRef.current.set(street, status.status);
                    return { street, status: status.status };
                }
            } catch (error) {
                console.error(`Error fetching status for ${street}:`, error);
            }
            return { street, status: 'unknown' };
        });

        const results = await Promise.all(statusPromises);
        console.log('Initial street statuses:', results);
        return results;
    };

    useEffect(() => {
        console.log('TreeMap received trees:', trees.length ? {
            first_tree: trees[0],
            last_tree: trees[trees.length - 1],
            sample_coordinates: trees[0] ? {
                latitude: trees[0].latitude,
                longitude: trees[0].longitude,
                isValidLat: typeof trees[0].latitude === 'number' && !isNaN(trees[0].latitude),
                isValidLng: typeof trees[0].longitude === 'number' && !isNaN(trees[0].longitude)
            } : 'No trees'
        } : 'No trees');

        // Validate tree data with detailed logging
        const validTrees = trees.filter(tree => {
            if (!tree) {
                console.log('Found null/undefined tree');
                return false;
            }

            const isValidLat = typeof tree.latitude === 'number' &&
                !isNaN(tree.latitude) &&
                tree.latitude !== 0 &&
                tree.latitude >= 49.1 && // Vancouver's approximate bounds
                tree.latitude <= 49.4;

            const isValidLng = typeof tree.longitude === 'number' &&
                !isNaN(tree.longitude) &&
                tree.longitude !== 0 &&
                tree.longitude >= -123.3 && // Vancouver's approximate bounds
                tree.longitude <= -122.9;

            if (!isValidLat || !isValidLng) {
                console.log('Invalid coordinates found:', {
                    tree_id: tree.tree_id,
                    street: tree.std_street,
                    latitude: tree.latitude,
                    longitude: tree.longitude,
                    isValidLat,
                    isValidLng
                });
                return false;
            }

            return true;
        });

        console.log('Coordinate validation results:', {
            total_trees: trees.length,
            valid_trees: validTrees.length,
            first_valid_tree: validTrees[0] ? {
                tree_id: validTrees[0].tree_id,
                street: validTrees[0].std_street,
                coordinates: {
                    lat: validTrees[0].latitude,
                    lng: validTrees[0].longitude
                }
            } : 'No valid trees'
        });

        if (validTrees.length === 0) {
            console.warn('No valid tree coordinates found in the data. All trees:', trees.slice(0, 5).map(tree => ({
                tree_id: tree?.tree_id,
                street: tree?.std_street,
                latitude: tree?.latitude,
                longitude: tree?.longitude
            })));
            return;
        }

        if (!mapContainerRef.current) {
            console.log('Map container not ready');
            return;
        }

        // Initialize map if not already done
        if (!mapRef.current) {
            console.log('Initializing map');
            mapRef.current = L.map(mapContainerRef.current).setView([49.2827, -123.1207], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(mapRef.current);
        }

        // Clear existing markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        // Group trees by street with coordinate validation
        const streetGroups = new Map<string, StreetGroup>();
        trees.forEach(tree => {
            if (!streetGroups.has(tree.std_street)) {
                streetGroups.set(tree.std_street, {
                    street: tree.std_street,
                    count: 0,
                    trees: [],
                    bloomStatus: 'unknown'
                });
            }
            const group = streetGroups.get(tree.std_street)!;
            group.count++;
            group.trees.push(tree);
        });

        console.log('Street groups created:', {
            total_streets: streetGroups.size,
            sample_street: Array.from(streetGroups.entries())[0] ? {
                street: Array.from(streetGroups.entries())[0][0],
                count: Array.from(streetGroups.entries())[0][1].count,
                sample_tree: Array.from(streetGroups.entries())[0][1].trees[0]
            } : 'No streets'
        });

        // Store street groups for later use
        streetGroupsRef.current = streetGroups;

        // Fetch initial statuses for all streets
        const streets = Array.from(streetGroups.keys());
        fetchStreetStatuses(streets).then(async statuses => {
            // Update street groups with initial statuses
            statuses.forEach(({ street, status }) => {
                const group = streetGroups.get(street);
                if (group) {
                    group.bloomStatus = status;
                }
            });

            // Fetch last report timestamps for all streets
            const lastReportsPromises = streets.map(async (street) => {
                try {
                    const status = await bloomStatusService.getStatus(street);
                    if (status) {
                        return { street, lastReport: status };
                    }
                } catch (error) {
                    console.error(`Error fetching last report for ${street}:`, error);
                }
                return { street, lastReport: null };
            });

            const lastReports = await Promise.all(lastReportsPromises);

            // Update street groups with last report timestamps
            lastReports.forEach(({ street, lastReport }) => {
                const group = streetGroups.get(street);
                if (group && lastReport) {
                    group.lastReport = { timestamp: lastReport.timestamp };
                }
            });

            // Create markers for streets with more than 20 trees
            streetGroups.forEach((group, street) => {
                if (group.count >= 20) {
                    const avgLat = group.trees.reduce((sum, tree) => sum + tree.latitude, 0) / group.count;
                    const avgLng = group.trees.reduce((sum, tree) => sum + tree.longitude, 0) / group.count;

                    const marker = L.marker([avgLat, avgLng], {
                        icon: createSakuraMarkerIcon(group.count, group.bloomStatus || 'unknown')
                    });

                    // Remove tooltip binding
                    const statusEmoji = (group.bloomStatus || 'unknown') === 'blooming' ? '🌸' :
                        (group.bloomStatus || 'unknown') === 'ing' ? '🌱' : '❓';

                    const popupContent = `
                        <div style="text-align: center;">
                            <strong>${street}</strong><br>
                            ${group.count} 🌸🌸 trees
                        </div>
                        <div id="status-report-${street.replace(/\s+/g, '-')}"></div>
                        <div></div>
                    `;

                    marker.bindPopup(popupContent);
                    marker.addTo(mapRef.current!);
                    markersRef.current.push(marker);

                    // Create root for BloomStatusReport component
                    const container = document.getElementById(`status-report-${street.replace(/\s+/g, '-')}`);
                    if (container) {
                        let root = rootsRef.current.get(street);
                        if (!root) {
                            root = createRoot(container);
                            rootsRef.current.set(street, root);
                        }

                        const statusReport = (
                            <BloomStatusReport
                                street={street}
                                neighborhood={neighborhood}
                                latitude={avgLat}
                                longitude={avgLng}
                                treeCount={group.count}
                                currentStatus={group.bloomStatus as 'blooming' | 'unknown'}
                                onStatusUpdate={(newStatus) => {
                                    console.log('Status update requested from TreeMap:', { street, newStatus });
                                    handleStatusUpdate(street, newStatus);
                                }}
                            />
                        );

                        root.render(statusReport);
                    }

                    // Add click handler to open popup
                    marker.on('click', () => {
                        marker.openPopup();
                        // Ensure the BloomStatusReport component is rendered
                        const container = document.getElementById(`status-report-${street.replace(/\s+/g, '-')}`);
                        if (container) {
                            let root = rootsRef.current.get(street);
                            if (!root) {
                                root = createRoot(container);
                                rootsRef.current.set(street, root);
                            }

                            const statusReport = (
                                <BloomStatusReport
                                    street={street}
                                    neighborhood={neighborhood}
                                    latitude={avgLat}
                                    longitude={avgLng}
                                    treeCount={group.count}
                                    currentStatus={group.bloomStatus as 'blooming' | 'unknown'}
                                    onStatusUpdate={(newStatus) => {
                                        console.log('Status update requested from TreeMap:', { street, newStatus });
                                        handleStatusUpdate(street, newStatus);
                                    }}
                                />
                            );

                            root.render(statusReport);
                        }
                    });
                }
            });

            // Fit bounds to show all markers
            if (markersRef.current.length > 0) {
                const bounds = L.latLngBounds(markersRef.current.map(marker => marker.getLatLng()));
                mapRef.current!.fitBounds(bounds, { padding: [50, 50] });
            }
        });

        // Cleanup function
        return () => {
            markersRef.current.forEach(marker => marker.remove());
            rootsRef.current.forEach(root => root.unmount());
        };
    }, [trees, neighborhood]);

    return <div ref={mapContainerRef} style={{ height: '400px', width: '100%' }} />;
};

export default TreeMap;