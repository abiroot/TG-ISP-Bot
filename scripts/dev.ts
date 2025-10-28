import 'dotenv/config'
import { spawn } from 'child_process'
import { env } from '../src/config/env'

let appProcess: any = null

async function startDevelopment() {
    console.log('🚀 Starting Telegram bot development environment...\n')

    try {
        console.log('\n📋 Development Environment Ready:')
        console.log(`   Local URL: http://localhost:${env.PORT}`)
        console.log(`   Health Check: http://localhost:${env.PORT}/health`)
        console.log('\n')

        // Start the application with nodemon
        console.log('🔄 Starting application with nodemon...\n')
        appProcess = spawn('npx', ['nodemon', './src/app.ts'], {
            stdio: 'inherit',
            shell: true,
        })

        appProcess.on('error', (error: Error) => {
            console.error('❌ Failed to start application:', error)
            cleanup()
        })
    } catch (error) {
        console.error('❌ Failed to start development environment:', error)
        cleanup()
        process.exit(1)
    }
}

async function cleanup() {
    console.log('\n\n👋 Shutting down development environment...')

    // Kill app process
    if (appProcess) {
        appProcess.kill()
    }

    process.exit(0)
}

// Handle graceful shutdown
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('exit', cleanup)

// Start development
startDevelopment()
