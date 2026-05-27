import { Connector } from './connector'
import { config, logPath, disableWatchdog, logLevel } from './config'

import * as Winston from 'winston'
import * as path from 'path'
import { stringifyError } from '@sofie-automation/server-core-integration'

console.log('process started') // This is a message all Sofie processes log upon startup

// custom json stringifier
const { splat, combine, printf } = Winston.format
const myFormat = combine(
	splat(),
	printf((obj) => {
		obj.localTimestamp = new Date().toISOString()
		// Prevent errors and other objects to be inserted as Objects into message field
		if (typeof obj.message === 'object') {
			if (obj.message instanceof Error) {
				const errorObj = obj.message
				obj.message = errorObj.message
				obj.details = errorObj
			} else {
				obj.message = JSON.stringify(obj.message)
			}
		}
		return JSON.stringify(obj) // make single line
	})
)

// Setup logging --------------------------------------
let logger: Winston.Logger
if (logPath) {
	const transportConsole = new Winston.transports.Console({
		level: logLevel || 'silly',
		handleExceptions: true,
		handleRejections: true,
	})
	const transportFile = new Winston.transports.File({
		level: logLevel || 'silly',
		handleExceptions: true,
		handleRejections: true,
		filename: logPath,
		format: myFormat,
	})

	logger = Winston.createLogger({
		transports: [transportConsole, transportFile],
	})
	logger.info('Logging to', logPath)

	// Hijack console.log:
	const orgConsoleLog = console.log
	console.log = function (...args: any[]) {
		// orgConsoleLog('a')
		if (args.length >= 1) {
			logger.debug(args.join(' '), { rawData: args })
			orgConsoleLog(...args)
		}
	}
} else {
	// Log json to console
	const transportConsole = new Winston.transports.Console({
		level: logLevel || 'silly',
		handleExceptions: true,
		handleRejections: true,
		format: myFormat,
	})

	const transports: Winston.transport[] = [transportConsole]

	if (process.env.ALSO_LOG_TO_FILE) {
		const filename = path.resolve(process.env.ALSO_LOG_TO_FILE)
		const transportFile = new Winston.transports.File({
			level: logLevel || 'silly',
			handleExceptions: true,
			handleRejections: true,
			filename,
			// If the max size is exceeded then a new file is created, a counter will become a suffix of the log file.
			maxsize: 10 * 1024 * 1024, // 10MB
		})
		transports.push(transportFile)
		console.log(`Also logging to ${filename}`)
	}

	logger = Winston.createLogger({ transports })
	logger.info('Logging to Console')

	// Hijack console.log:
	console.log = function (...args: any[]) {
		// orgConsoleLog('a')
		if (args.length >= 1) {
			logger.debug(args.join(' '), { rawData: args })
		}
	}
}

// Because the default NodeJS-handler sucks and wont display error properly
process.on('warning', (e: any) => {
	logger.error(`Unhandled warning: ${stringifyError(e)}`)
})

logger.info('------------------------------------------------------------------')
logger.info('Starting Playout Gateway')
if (disableWatchdog) logger.info('Watchdog is disabled!')
const connector = new Connector(logger)

logger.info('Core:          ' + config.core.host + ':' + config.core.port)
logger.info('------------------------------------------------------------------')
connector.init(config).catch((e) => {
	logger.error(e)
})
