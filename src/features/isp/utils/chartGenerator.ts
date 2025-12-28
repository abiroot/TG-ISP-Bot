/**
 * Chart Generator Utility
 *
 * Generates bandwidth usage charts using QuickChart.io API
 * Returns image buffer for sending via Telegram
 */

import { createFlowLogger } from '~/core/utils/logger'
import type { UserStatDataPoint } from '../services/ISPService'

const logger = createFlowLogger('chart-generator')

/**
 * Chart configuration options
 */
interface ChartOptions {
    width?: number
    height?: number
    title?: string
    backgroundColor?: string
}

/**
 * Format date for chart labels (HH:mm:ss)
 */
function formatTimeLabel(dateStr: string): string {
    try {
        // Parse "2025-12-28 19:36:02" format
        const timePart = dateStr.split(' ')[1]
        return timePart || dateStr
    } catch {
        return dateStr
    }
}

/**
 * Calculate statistics from data points
 */
export function calculateStats(data: UserStatDataPoint[]): {
    avgUp: number
    avgDown: number
    maxUp: number
    maxDown: number
    limitUp: number
    limitDown: number
} {
    if (data.length === 0) {
        return { avgUp: 0, avgDown: 0, maxUp: 0, maxDown: 0, limitUp: 0, limitDown: 0 }
    }

    const totalUp = data.reduce((sum, d) => sum + d.currentUp, 0)
    const totalDown = data.reduce((sum, d) => sum + d.currentDown, 0)
    const maxUp = Math.max(...data.map((d) => d.currentUp))
    const maxDown = Math.max(...data.map((d) => d.currentDown))

    return {
        avgUp: Math.round(totalUp / data.length),
        avgDown: Math.round(totalDown / data.length),
        maxUp,
        maxDown,
        limitUp: data[0]?.limitUp || 0,
        limitDown: data[0]?.limitDown || 0,
    }
}

/**
 * Generate bandwidth usage chart using QuickChart.io
 * Returns image buffer for Telegram
 */
export async function generateBandwidthChart(
    data: UserStatDataPoint[],
    options: ChartOptions = {}
): Promise<Buffer> {
    const { width = 800, height = 400, title = 'Bandwidth Usage', backgroundColor = '#ffffff' } = options

    if (data.length === 0) {
        throw new Error('No data points provided for chart generation')
    }

    // Prepare data for chart
    const labels = data.map((d) => formatTimeLabel(d.date))
    const uploadData = data.map((d) => d.currentUp)
    const downloadData = data.map((d) => d.currentDown)
    const limitUp = data[0]?.limitUp || 0
    const limitDown = data[0]?.limitDown || 0

    // Chart.js configuration for QuickChart
    const chartConfig = {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Download (kbps)',
                    data: downloadData,
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: '#3498db',
                },
                {
                    label: 'Upload (kbps)',
                    data: uploadData,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: '#e74c3c',
                },
                {
                    label: `Download Limit (${limitDown} kbps)`,
                    data: new Array(data.length).fill(limitDown),
                    borderColor: 'rgba(52, 152, 219, 0.4)',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                },
                {
                    label: `Upload Limit (${limitUp} kbps)`,
                    data: new Array(data.length).fill(limitUp),
                    borderColor: 'rgba(231, 76, 60, 0.4)',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                },
            ],
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: { size: 16, weight: 'bold' },
                },
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true },
                },
            },
            scales: {
                x: {
                    title: { display: true, text: 'Time' },
                    ticks: { maxRotation: 45 },
                },
                y: {
                    title: { display: true, text: 'Speed (kbps)' },
                    beginAtZero: true,
                },
            },
        },
    }

    // Build QuickChart URL
    const quickChartUrl = 'https://quickchart.io/chart'
    const params = new URLSearchParams({
        c: JSON.stringify(chartConfig),
        w: width.toString(),
        h: height.toString(),
        bkg: backgroundColor,
        f: 'png',
    })

    logger.info({ dataPoints: data.length, width, height }, 'Generating bandwidth chart via QuickChart')

    try {
        const response = await fetch(`${quickChartUrl}?${params.toString()}`)

        if (!response.ok) {
            throw new Error(`QuickChart API error: ${response.statusText}`)
        }

        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        logger.info({ bufferSize: buffer.length }, 'Chart generated successfully')

        return buffer
    } catch (error) {
        logger.error({ err: error }, 'Failed to generate chart')
        throw error
    }
}

/**
 * Format statistics for display in Telegram message
 */
export function formatStatsMessage(
    stats: ReturnType<typeof calculateStats>,
    identifier: string
): string {
    return `📊 <b>Bandwidth Statistics</b>

<b>User:</b> <code>${identifier}</code>

<b>Current Usage:</b>
↓ Download: Avg <b>${stats.avgDown}</b> kbps | Peak <b>${stats.maxDown}</b> kbps
↑ Upload: Avg <b>${stats.avgUp}</b> kbps | Peak <b>${stats.maxUp}</b> kbps

<b>Limits:</b>
↓ Download: <b>${stats.limitDown}</b> kbps
↑ Upload: <b>${stats.limitUp}</b> kbps`
}
