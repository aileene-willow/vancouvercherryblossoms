import React, { useState, useEffect } from 'react';
import { BloomStatus } from '../types/bloomStatus';
import type { BloomStatusReport as BloomStatusReportType } from '../types/bloomStatus';
import { bloomStatusService } from '../services/bloomStatusService';
import './BloomStatusReport.css';

interface BloomStatusReportProps {
    street: string;
    neighborhood: string;
    latitude: number;
    longitude: number;
    treeCount: number;
    currentStatus?: BloomStatus;
    onStatusUpdate: (status: BloomStatus) => void;
}

export const BloomStatusReport: React.FC<BloomStatusReportProps> = ({
    street,
    neighborhood,
    latitude,
    longitude,
    treeCount,
    currentStatus,
    onStatusUpdate
}) => {
    const [selectedStatus, setSelectedStatus] = useState<BloomStatus>(currentStatus || 'unknown');
    const [lastReport, setLastReport] = useState<BloomStatusReportType | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadStatus();
    }, [street]);

    const loadStatus = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const status = await bloomStatusService.getStatus(street);
            if (status) {
                setLastReport(status);
                setSelectedStatus(status.status);
            }
        } catch (err) {
            setError('Failed to load status. Please try again.');
            console.error('Error loading status:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleStatusChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newStatus = event.target.value as BloomStatus;
        console.log('Status change triggered:', { newStatus, currentStatus });
        setSelectedStatus(newStatus);

        try {
            const report: Omit<BloomStatusReportType, 'id'> = {
                street,
                status: newStatus,
                timestamp: new Date().toISOString(),
                reporter: 'Anonymous', // TODO: Replace with actual user ID when auth is implemented
                neighborhood,
                latitude,
                longitude,
                treeCount
            };

            console.log('Preparing to send status update:', report);
            console.log('API URL:', process.env.REACT_APP_API_BASE_URL);

            const savedReport = await bloomStatusService.updateStatus(report);
            console.log('Status update successful:', savedReport);

            setLastReport(savedReport);
            onStatusUpdate(newStatus);
        } catch (err) {
            console.error('Error updating status:', err);
            setError('Failed to update status. Please try again.');
            // Revert selection on error
            setSelectedStatus(currentStatus || 'unknown');
        }
    };

    const getStatusEmoji = (status: BloomStatus) => {
        switch (status) {
            case 'blooming': return '🌸';
            default: return '❓';
        }
    };

    const formatDate = (dateString: string): string => {
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                return 'No report available';
            }
            return date.toLocaleString();
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'No report available';
        }
    };

    if (isLoading) {
        return <div className="bloom-status-report">Loading...</div>;
    }

    return (
        <div className="bloom-status-report">
            {error && <div className="error-message">{error}</div>}
            <select
                value={selectedStatus}
                onChange={handleStatusChange}
                className="status-select"
                aria-label="Bloom status"
            >
                <option value="blooming">🌸 Blooming</option>
                <option value="unknown">❓ Unknown</option>
            </select>
            <div className="status-info">
                <small>
                    {lastReport ?
                        `Last reported: ${formatDate(lastReport.timestamp)}` :
                        'No report yet'
                    }
                </small>
            </div>
        </div>
    );
}; 