import React from 'react';
import { BloomStatus } from '../types/bloomStatus';
import './BloomStatusCell.css';

interface BloomStatusCellProps {
    status: BloomStatus;
    lastUpdated?: string;
}

const getStatusEmoji = (status: BloomStatus) => {
    switch (status) {
        case 'blooming': return '🌸';
        default: return '❓';
    }
};

const getStatusLabel = (status: BloomStatus) => {
    switch (status) {
        case 'blooming': return 'Blooming';
        default: return 'Unknown';
    }
};

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const BloomStatusCell: React.FC<BloomStatusCellProps> = ({ status, lastUpdated }) => {
    const statusEmoji = getStatusEmoji(status);
    const statusLabel = getStatusLabel(status);


    return (
        <div className="bloom-status-cell" title={lastUpdated ? `Last reported: ${formatDate(lastUpdated)}` : 'No report available'}>
            {lastUpdated && (
                <div className="status-tooltip">
                    Last reported: {formatDate(lastUpdated)}` :
                    'No report available'
                </div>
            )}
        </div>
    );
};

export default BloomStatusCell; 