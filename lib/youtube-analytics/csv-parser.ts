import { parse } from 'csv-parse/sync';

interface CSVRow {
    [key: string]: string | undefined;
}

export interface ParsedMetric {
    youtubeVideoId: string;
    date: Date;
    title?: string;
    publishedAt?: Date;
    views?: number;
    watchTimeMinutes?: number;
    avgViewDurationSec?: number;
    impressions?: number;
    impressionsCtr?: number;
    likes?: number;
    comments?: number;
    averageViewedPercent?: number;
    trafficSource?: string;
    deviceType?: string;
}

export interface ParseResult {
    success: boolean;
    data: ParsedMetric[];
    errors: Array<{ row: number; error: string }>;
    stats: {
        totalRows: number;
        imported: number;
        skipped: number;
    };
}

// Mapping of internal keys to possible CSV header names (normalized to snake_case or specific strings)
const COLUMN_MAPPINGS: Record<string, string[]> = {
    video_id: ['video_id', 'content', 'video', 'id'],
    title: ['title', 'video_title', 'video title'],
    published_at: ['published_at', 'video_publish_time', 'video publish time', 'publish_time', 'time_published'],
    date: ['date', 'time'],
    views: ['views', 'view_count'],
    watch_time_minutes: ['watch_time_minutes', 'watch_time_hours', 'watch time (hours)'],
    avg_view_duration_sec: ['avg_view_duration_sec', 'average_view_duration', 'average view duration'],
    impressions: ['impressions'],
    impressions_ctr: ['impressions_ctr', 'ctr', 'impressions click-through rate (%)', 'impressions_click_through_rate'],
    likes: ['likes'],
    comments: ['comments', 'comments_added', 'comments added'],
    average_percentage_viewed: ['average_percentage_viewed', 'average_view_percentage', 'average percentage viewed (%)'],
    traffic_source: ['traffic_source'],
    device_type: ['device_type']
};

/**
 * Helper to normalize string to comparison key
 */
function normalizeKey(key: string): string {
    return key.trim().toLowerCase().replace(/['"]/g, '');
}

/**
 * Parse number handling localized formats (1.234,56 or 1,234.56)
 */
function parseNumber(value: string | undefined): number | undefined {
    if (!value) return undefined;

    let cleanVal = value.trim();
    if (cleanVal === '') return undefined;

    // Check if it's a "comma as decimal" format (e.g. 119,14 or 1.234,56)
    // Heuristic: If it has a comma and NO dots, or if comma is after dot
    const hasComma = cleanVal.includes(',');
    const hasDot = cleanVal.includes('.');

    if (hasComma && !hasDot) {
        // e.g. "119,14" -> replace comma with dot
        cleanVal = cleanVal.replace(',', '.');
    } else if (hasComma && hasDot) {
        const lastDot = cleanVal.lastIndexOf('.');
        const lastComma = cleanVal.lastIndexOf(',');

        if (lastComma > lastDot) {
            // e.g. 1.234,56 (European/BR) -> Remove dots, replace comma with dot
            cleanVal = cleanVal.replace(/\./g, '').replace(',', '.');
        } else {
            // e.g. 1,234.56 (US) -> Remove commas
            cleanVal = cleanVal.replace(/,/g, '');
        }
    }

    // Remove any remaining % signs
    cleanVal = cleanVal.replace(/%/g, '');

    const num = parseFloat(cleanVal);
    return isNaN(num) ? undefined : num;
}

/**
 * Parse duration string (HH:MM:SS or MM:SS or seconds) to seconds
 */
function parseDurationToSeconds(value: string | undefined): number | undefined {
    if (!value) return undefined;

    // If it's already a number (possibly as string)
    if (!value.includes(':')) {
        return parseNumber(value);
    }

    const parts = value.split(':').map(part => parseFloat(part));
    let seconds = 0;

    if (parts.length === 3) {
        // HH:MM:SS
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        // MM:SS
        seconds = parts[0] * 60 + parts[1];
    }

    return seconds;
}

/**
 * Identify column mappings from headers
 */
function identifyColumns(headers: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    const normalizedHeaders = headers.map(normalizeKey);

    for (const [internalKey, variations] of Object.entries(COLUMN_MAPPINGS)) {
        for (const variation of variations) {
            const normalizedVar = normalizeKey(variation);
            const index = normalizedHeaders.indexOf(normalizedVar);
            if (index !== -1) {
                map[internalKey] = headers[index]; // Store original header key
                break;
            }
        }
    }
    return map;
}

/**
 * Parse YouTube Studio CSV export
 * Handles multiple column name variations and validates data
 */
export function parseYouTubeCSV(fileContent: string): ParseResult {
    const errors: Array<{ row: number; error: string }> = [];
    const metrics: ParsedMetric[] = [];

    try {
        // Parse CSV with flexible options
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            bom: true, // Handle UTF-8 BOM
            relax_quotes: true,
            relax_column_count: true,
        }) as CSVRow[];

        if (records.length === 0) {
            return {
                success: false,
                data: [],
                errors: [{ row: 0, error: 'CSV file is empty or has no data rows' }],
                stats: { totalRows: 0, imported: 0, skipped: 0 },
            };
        }

        // Identify columns based on first row keys
        const headers = Object.keys(records[0]);
        const colMap = identifyColumns(headers);

        // Helper to get value using mapped key
        const getValue = (row: CSVRow, internalKey: string): string | undefined => {
            const header = colMap[internalKey];
            return header ? row[header] : undefined;
        };

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rowNumber = i + 2; // +2 for header + 0-index

            try {
                const videoId = getValue(row, 'video_id');

                // Skip summary rows (e.g., "Total") or empty IDs
                if (!videoId || videoId.toLowerCase() === 'total') {
                    continue;
                }

                // Parse Date
                // If 'date' column exists, use it. Otherwise, defaults to 'published_at' if available, or today (snapshot)
                let dateStr = getValue(row, 'date');
                let parsedDate: Date;

                if (dateStr) {
                    parsedDate = new Date(dateStr);
                } else {
                    // Use published_at as date? Or just use current date for snapshot import?
                    // For lifetime videos export, there is no "Date" column. We use Today (midnight).
                    parsedDate = new Date();
                    parsedDate.setHours(0, 0, 0, 0);
                }

                if (isNaN(parsedDate.getTime())) {
                    errors.push({ row: rowNumber, error: 'Invalid date format' });
                    continue;
                }

                const publishedAtStr = getValue(row, 'published_at');
                let publishedAt: Date | undefined;
                if (publishedAtStr) {
                    const pubDate = new Date(publishedAtStr);
                    if (!isNaN(pubDate.getTime())) {
                        publishedAt = pubDate;
                    }
                }

                // Build metric object
                const metric: ParsedMetric = {
                    youtubeVideoId: videoId,
                    date: parsedDate,
                    publishedAt: publishedAt
                };

                // Optional fields
                const title = getValue(row, 'title');
                if (title) metric.title = title;

                metric.views = parseNumber(getValue(row, 'views'));

                // Handle Watch Time: if source was 'watch time (hours)', convert to minutes
                const watchTimeRaw = getValue(row, 'watch_time_minutes'); // Mapped to column
                // Check which column matched
                const matchedWatchTimeHeader = colMap['watch_time_minutes'];
                let watchTime = parseNumber(watchTimeRaw);

                if (watchTime !== undefined && matchedWatchTimeHeader && matchedWatchTimeHeader.toLowerCase().includes('hours')) {
                    watchTime = watchTime * 60;
                }
                metric.watchTimeMinutes = watchTime;

                // Duration
                metric.avgViewDurationSec = parseDurationToSeconds(getValue(row, 'avg_view_duration_sec'));

                metric.impressions = parseNumber(getValue(row, 'impressions'));

                // CTR (Percentage)
                let ctr = parseNumber(getValue(row, 'impressions_ctr'));
                if (ctr !== undefined && ctr > 1) {
                    // Assume percentage 5.2 -> 0.052
                    const matchedHeader = colMap['impressions_ctr'];
                    // If header contains '%', strictly divide? Or just assume heuristic.
                    // Heuristic: CTR > 1 is likely percentage
                    ctr = ctr / 100;
                }
                metric.impressionsCtr = ctr;

                metric.likes = parseNumber(getValue(row, 'likes'));
                metric.comments = parseNumber(getValue(row, 'comments'));

                // Avg Viewed Percent
                let avgPercent = parseNumber(getValue(row, 'average_percentage_viewed'));
                if (avgPercent !== undefined && avgPercent > 1) {
                    avgPercent = avgPercent / 100;
                }
                metric.averageViewedPercent = avgPercent;

                metric.trafficSource = getValue(row, 'traffic_source');
                metric.deviceType = getValue(row, 'device_type');

                metrics.push(metric);
            } catch (rowError) {
                errors.push({
                    row: rowNumber,
                    error: `Parse error: ${rowError instanceof Error ? rowError.message : String(rowError)}`,
                });
            }
        }

        return {
            success: errors.length === 0 || metrics.length > 0, // Success if at least some metrics imported
            data: metrics,
            errors,
            stats: {
                totalRows: records.length,
                imported: metrics.length,
                skipped: errors.length,
            },
        };
    } catch (error) {
        throw new Error(
            `CSV parsing failed: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Validate CSV structure by checking for required columns
 */
export function validateCSVStructure(fileContent: string): {
    valid: boolean;
    missingColumns: string[];
} {
    try {
        const firstLine = fileContent.split('\n')[0];
        const headers = firstLine
            .toLowerCase()
            .split(',')
            .map((h) => h.trim().replace(/"/g, ''));

        // We require at least 'video_id' (or 'content')
        // We do NOT strictly require date anymore, as we default to Now for snapshots
        const map = identifyColumns(headers);
        const hasVideoId = !!map['video_id'];

        return {
            valid: hasVideoId,
            missingColumns: hasVideoId ? [] : ['video_id (or Content)'],
        };
    } catch (error) {
        return {
            valid: false,
            missingColumns: ['Header parsing failed'],
        };
    }
}
