import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Neighborhood {
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

interface NeighborhoodMapProps {
    neighborhoods: Neighborhood[];
    onNeighborhoodClick: (neighborhood: string) => void;
}

const NeighborhoodMap: React.FC<NeighborhoodMapProps> = ({ neighborhoods, onNeighborhoodClick }) => {
    const mapRef = useRef<L.Map | null>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!mapContainerRef.current) return;

        // Initialize map centered on Vancouver with closer zoom
        const map = L.map(mapContainerRef.current).setView([49.2827, -123.1207], 13);
        mapRef.current = map;

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Define Vancouver bounds
        const vancouverBounds = L.latLngBounds(
            [49.2, -123.3], // Southwest corner
            [49.4, -122.9]  // Northeast corner
        );

        // Create markers for each neighborhood
        neighborhoods.forEach(neighborhood => {
            console.log(`\nProcessing marker for ${neighborhood.name}:`, {
                coordinates: neighborhood.coordinates,
                hasConfirmedBlooms: neighborhood.hasConfirmedBlooms,
                count: neighborhood.count,
                isWithinBounds: vancouverBounds.contains([neighborhood.coordinates?.lat || 49.2827, neighborhood.coordinates?.lng || -123.1207]),
                hasEnoughTrees: neighborhood.count > 10
            });

            // Use the neighborhood's coordinates if available, otherwise use Vancouver's center
            const position: [number, number] = neighborhood.coordinates &&
                neighborhood.coordinates.lat !== 0 &&
                neighborhood.coordinates.lng !== 0
                ? [neighborhood.coordinates.lat, neighborhood.coordinates.lng]
                : [49.2827, -123.1207];

            // Only create marker if it's within Vancouver bounds and has more than 10 trees
            if (vancouverBounds.contains(position) && neighborhood.count > 10) {
                // Determine marker color based on bloom status
                let markerColor = '#ffffff'; // Default white for unknown
                if (neighborhood.hasConfirmedBlooms === true) {
                    markerColor = '#d81b60'; // Dark pink for confirmed blooms
                    console.log(`${neighborhood.name}: Dark pink - Confirmed blooms`);
                }
                else {
                    console.log(`${neighborhood.name}: White - Unknown status (mixed or no reports)`);
                }

                // Create custom marker icon with neighborhood name and tree count
                const markerIcon = L.divIcon({
                    className: 'neighborhood-marker',
                    html: `
                        <div style="
                            width: 20px;
                            height: 20px;
                            background-color: ${markerColor};
                            border-radius: 50%;
                            border: 2px solid white;
                            box-shadow: 0 0 10px rgba(0,0,0,0.3);
                            position: relative;
                        ">
                            <div style="
                                position: absolute;
                                top: 25px;
                                left: 50%;
                                transform: translateX(-50%);
                                background-color: white;
                                padding: 4px 6px;
                                border-radius: 4px;
                                font-size: 12px;
                                white-space: nowrap;
                                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                                z-index: 1000;
                                text-align: center;
                                line-height: 1.2;
                            ">
                                <div>${neighborhood.name}</div>
                                <div style="
                                    font-size: 11px;
                                    color: #666;
                                    margin-top: 2px;
                                ">${neighborhood.count} 🌸 trees</div>
                            </div>
                        </div>
                    `,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                });

                // Create marker
                const marker = L.marker(position, { icon: markerIcon }).addTo(map);
                console.log(`Creating marker for ${neighborhood.name} at position:`, position);

                // Add click handler to marker
                marker.on('click', () => {
                    onNeighborhoodClick(neighborhood.name);
                });

                // Add popup with neighborhood info and clickable link
                const popupContent = `
                    <div class="neighborhood-popup">
                        <h3>${neighborhood.name}</h3>
                        <p>Number of Trees: ${neighborhood.count}</p>
                        ${neighborhood.hasConfirmedBlooms ?
                        `<p class="confirmed-blooms">Confirmed Blooms</p>
                             <p class="report-date">Latest report: ${new Date(neighborhood.latestBloomReport?.timestamp || '').toLocaleString()}</p>`
                        : ''}
                        <button class="view-details-button" onclick="window.dispatchEvent(new CustomEvent('neighborhoodClick', { detail: '${neighborhood.name}' }))">
                            View Details
                        </button>
                    </div>
                `;
                marker.bindPopup(popupContent);
            }
        });

        // Always maintain the same view of Vancouver
        map.setView([49.2827, -123.1207], 13);

        // Cleanup
        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
            }
        };
    }, [neighborhoods, onNeighborhoodClick]);

    return (
        <div className="neighborhood-map-section">
            <div className="map-legend" style={{
                display: 'flex',
                justifyContent: 'center',
            }}>
                <div className="legend-items" >
                    <div className="legend-item">
                        <div className="legend-color" style={{ backgroundColor: '#d81b60' }}></div>
                        <span>Confirmed Blooms</span>
                    </div>
                    <div className="legend-item">
                        <div className="legend-color" style={{ backgroundColor: '#ffffff' }}></div>
                        <span>Bloom Status Unknown</span>
                    </div>
                </div>
            </div>
            <div className="neighborhood-map-container">
                <div ref={mapContainerRef} className="neighborhood-map" />
            </div>
        </div>
    );
};

export default NeighborhoodMap; 