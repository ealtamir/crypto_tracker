import * as winston from 'winston'
import * as dd from 'hot-shots'


const dogstatsd = new dd.StatsD()

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
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'app.log', level: 'info' })
    ]
});

logger.info('Logger created')

export { logger, dogstatsd }