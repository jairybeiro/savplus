/**
 * Formats a given timestamp into a human-readable waiting time string.
 * Examples: "15 min", "1h 20m", "2d 4h"
 */
export function formatWaitTime(timestamp: string): string {
    if (!timestamp) return '--';

    const start = new Date(timestamp).getTime();
    const now = new Date().getTime();
    const diffMs = now - start;

    if (diffMs < 0) return '0 min';

    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
        return `${diffDays}d ${diffHours % 24}h`;
    }

    if (diffHours > 0) {
        return `${diffHours}h ${diffMins % 60}m`;
    }

    return `${diffMins} min`;
}
