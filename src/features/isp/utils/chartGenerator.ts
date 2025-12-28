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
    /** Show percentages instead of actual speeds (for workers) */
    percentageMode?: boolean
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
 *
 * @param data - Array of bandwidth data points
 * @param options - Chart options including percentageMode for workers
 */
export async function generateBandwidthChart(
    data: UserStatDataPoint[],
    options: ChartOptions = {}
): Promise<Buffer> {
    const {
        width = 800,
        height = 400,
        title = 'Bandwidth Usage',
        backgroundColor = '#ffffff',
        percentageMode = false,
    } = options

    if (data.length === 0) {
        throw new Error('No data points provided for chart generation')
    }

    // Prepare data for chart
    const labels = data.map((d) => formatTimeLabel(d.date))
    const limitUp = data[0]?.limitUp || 1 // Avoid division by zero
    const limitDown = data[0]?.limitDown || 1

    // Calculate data based on mode
    let uploadData: number[]
    let downloadData: number[]
    let yAxisTitle: string
    let yAxisMax: number | undefined
    let downloadLabel: string
    let uploadLabel: string

    if (percentageMode) {
        // Convert to percentages for workers
        uploadData = data.map((d) => Math.round((d.currentUp / limitUp) * 100))
        downloadData = data.map((d) => Math.round((d.currentDown / limitDown) * 100))
        yAxisTitle = 'Usage (%)'
        yAxisMax = 100
        downloadLabel = 'Download (%)'
        uploadLabel = 'Upload (%)'
    } else {
        // Show actual speeds for admins
        uploadData = data.map((d) => d.currentUp)
        downloadData = data.map((d) => d.currentDown)
        yAxisTitle = 'Speed (kbps)'
        yAxisMax = undefined
        downloadLabel = 'Download (kbps)'
        uploadLabel = 'Upload (kbps)'
    }

    // Build datasets
    const datasets: any[] = [
        {
            label: downloadLabel,
            data: downloadData,
            borderColor: '#3498db',
            backgroundColor: 'rgba(52, 152, 219, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: '#3498db',
        },
        {
            label: uploadLabel,
            data: uploadData,
            borderColor: '#e74c3c',
            backgroundColor: 'rgba(231, 76, 60, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: '#e74c3c',
        },
    ]

    // Add limit lines only for admin mode (not percentage)
    if (!percentageMode) {
        datasets.push(
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
            }
        )
    } else {
        // Add 100% reference line for percentage mode
        datasets.push({
            label: 'Limit (100%)',
            data: new Array(data.length).fill(100),
            borderColor: 'rgba(46, 204, 113, 0.5)',
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0,
        })
    }

    // Chart.js configuration for QuickChart
    const chartConfig = {
        type: 'line',
        data: {
            labels,
            datasets,
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
                    title: { display: true, text: yAxisTitle },
                    beginAtZero: true,
                    ...(yAxisMax ? { max: yAxisMax } : {}),
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
 *
 * @param stats - Calculated statistics
 * @param identifier - Customer identifier
 * @param percentageMode - Show percentages instead of actual speeds (for workers)
 */
export function formatStatsMessage(
    stats: ReturnType<typeof calculateStats>,
    identifier: string,
    percentageMode: boolean = false
): string {
    if (percentageMode) {
        // Calculate percentages for workers
        const avgDownPct = stats.limitDown > 0 ? Math.round((stats.avgDown / stats.limitDown) * 100) : 0
        const avgUpPct = stats.limitUp > 0 ? Math.round((stats.avgUp / stats.limitUp) * 100) : 0
        const peakDownPct = stats.limitDown > 0 ? Math.round((stats.maxDown / stats.limitDown) * 100) : 0
        const peakUpPct = stats.limitUp > 0 ? Math.round((stats.maxUp / stats.limitUp) * 100) : 0

        return `📊 <b>Bandwidth Usage</b>

<b>User:</b> <code>${identifier}</code>

<b>Current Usage:</b>
↓ Download: Avg <b>${avgDownPct}%</b> | Peak <b>${peakDownPct}%</b>
↑ Upload: Avg <b>${avgUpPct}%</b> | Peak <b>${peakUpPct}%</b>

<i>Percentages relative to account limits</i>`
    }

    // Full details for admins
    return `📊 <b>Bandwidth Statistics</b>

<b>User:</b> <code>${identifier}</code>

<b>Current Usage:</b>
↓ Download: Avg <b>${stats.avgDown}</b> kbps | Peak <b>${stats.maxDown}</b> kbps
↑ Upload: Avg <b>${stats.avgUp}</b> kbps | Peak <b>${stats.maxUp}</b> kbps

<b>Limits:</b>
↓ Download: <b>${stats.limitDown}</b> kbps
↑ Upload: <b>${stats.limitUp}</b> kbps`
}
