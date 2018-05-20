import * as winston from 'winston'
import * as dd from 'hot-shots'
import { config } from './config'


const dogstatsd = new dd.StatsD()
const CONSOLE_DEBUG_LEVEL = (config.debug)? 'debug': 'info'

const myFormat = winston.format.printf((info: any) => {
    return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
  });
  
const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.label({ label: 'Logger' }),
        winston.format.timestamp(),
        myFormat
    ),
    transports: [
        new winston.transports.Console({ level: CONSOLE_DEBUG_LEVEL }),
        new winston.transports.File({ filename: 'app.log', level: 'info' })
    ]
});

logger.info('Logger created')

export { logger, dogstatsd }