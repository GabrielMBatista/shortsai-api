import { parse } from 'csv-parse/sync';

interface CSVRow {
    video_id: string;
    date: string;
    title?: string;
    published_at?: string;
    views?: string;
    watch_time_minutes?: string;
    avg_view_duration_sec?: string;
    average_view_duration?: string; // Alternative column name
    impressions?: string;
    impressions_ctr?: string;
    ctr?: string; // Alternative column name
    likes?: string;
    comments?: string;
    average_percentage_viewed?: string;
    average_view_percentage?: string; // Alternative column name
    traffic_source?: string;
    device_type?: string;
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

        for (let i = 0; i < records.length; i++) {
            const row = records[i];
            const rowNumber = i + 2; // +2 for header + 0-index

            try {
                // Validate required fields
                if (!row.video_id) {
                    errors.push({ row: rowNumber, error: 'Missing video_id' });
                    continue;
                }

                if (!row.date) {
                    errors.push({ row: rowNumber, error: 'Missing date' });
                    continue;
                }

                // Parse date safely
                const parsedDate = new Date(row.date);
                if (isNaN(parsedDate.getTime())) {
                    errors.push({ row: rowNumber, error: `Invalid date format: ${row.date}` });
                    continue;
                }

                // Build metric object
                const metric: ParsedMetric = {
                    youtubeVideoId: row.video_id.trim(),
                    date: parsedDate,
                };

                // Optional fields with safe parsing
                if (row.title) metric.title = row.title;

                if (row.published_at) {
                    const pubDate = new Date(row.published_at);
                    if (!isNaN(pubDate.getTime())) {
                        metric.publishedAt = pubDate;
                    }
                }

                if (row.views) {
                    const views = parseInt(row.views.replace(/,/g, ''), 10);
                    if (!isNaN(views)) metric.views = views;
                }

                if (row.watch_time_minutes) {
                    const watchTime = parseFloat(row.watch_time_minutes.replace(/,/g, ''));
                    if (!isNaN(watchTime)) metric.watchTimeMinutes = watchTime;
                }

                // Handle both column name variations
                const avgDuration = row.avg_view_duration_sec || row.average_view_duration;
                if (avgDuration) {
                    const duration = parseFloat(avgDuration.replace(/,/g, ''));
                    if (!isNaN(duration)) metric.avgViewDurationSec = duration;
                }

                if (row.impressions) {
                    const impr = parseInt(row.impressions.replace(/,/g, ''), 10);
                    if (!isNaN(impr)) metric.impressions = impr;
                }

                const ctr = row.impressions_ctr || row.ctr;
                if (ctr) {
                    // Handle percentage format (e.g., "5.2%" or "0.052")
                    let ctrValue = parseFloat(ctr.replace(/%/g, '').replace(/,/g, ''));
                    if (!isNaN(ctrValue)) {
                        // If value is > 1, assume it's in percentage form (5.2 instead of 0.052)
                        if (ctrValue > 1) ctrValue = ctrValue / 100;
                        metric.impressionsCtr = ctrValue;
                    }
                }

                if (row.likes) {
                    const likes = parseInt(row.likes.replace(/,/g, ''), 10);
                    if (!isNaN(likes)) metric.likes = likes;
                }

                if (row.comments) {
                    const comments = parseInt(row.comments.replace(/,/g, ''), 10);
                    if (!isNaN(comments)) metric.comments = comments;
                }

                const avgPercent = row.average_percentage_viewed || row.average_view_percentage;
                if (avgPercent) {
                    let percent = parseFloat(avgPercent.replace(/%/g, '').replace(/,/g, ''));
                    if (!isNaN(percent)) {
                        if (percent > 1) percent = percent / 100;
                        metric.averageViewedPercent = percent;
                    }
                }

                if (row.traffic_source) metric.trafficSource = row.traffic_source.trim();
                if (row.device_type) metric.deviceType = row.device_type.trim();

                metrics.push(metric);
            } catch (rowError) {
                errors.push({
                    row: rowNumber,
                    error: `Parse error: ${rowError instanceof Error ? rowError.message : String(rowError)}`,
                });
            }
        }

        return {
            success: errors.length === 0,
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

        const requiredColumns = ['video_id', 'date'];
        const missingColumns = requiredColumns.filter(
            (col) => !headers.includes(col) && !headers.includes(col.replace('_', ' '))
        );

        return {
            valid: missingColumns.length === 0,
            missingColumns,
        };
    } catch (error) {
        return {
            valid: false,
            missingColumns: ['video_id', 'date'],
        };
    }
}
