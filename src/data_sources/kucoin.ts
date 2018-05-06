import * as request from 'request'
import * as async from 'async'
import { logger } from '../logging_tools';
import * as _ from 'lodash'
import * as schema from '../schemas'

interface Consumer {

    consume: (data: schema.KucoinTicker[]) => void

}

class Kucoin {
    tickerURL: string = 'https://api.kucoin.com/v1/market/open/symbols'
    booksURL: string = 'https://api.kucoin.com/v1/open/orders'

    consumer: Consumer

    pairs: string[] = [
        "BTC-USDT", "ETH-USDT", "BCH-USDT",
        "NEO-USDT", "KCS-USDT", "CS-USDT",
        "ACT-USDT", "HSR-USDT", "LYM-USDT",
        "TKY-USDT", "XRB-USDT", "DRGN-USDT",
        "LTC-USDT", "EOS-USDT"
    ]

    constructor(consumer: Consumer) {
        this.consumer = consumer
    }

    start() {
        logger.debug('starting kucoin crawler')
        async.series({
            ticker: this.getTickerData,
            books: this.getBooksData
        }, (error: Error, result: any) => {
            if (error) {
                return logger.error(`Got an error when triggering data fetch on Kucoin: ${JSON.stringify(error)}`)
            }
            this.consumer.consume(this.formatData(result))
        })
    }

    getTickerData(callback: Function) {
        async.retry({times: 10, interval: 1000}, (cb) => {
            logger.debug(`attempting retrieval of ticker data`)
            request.get({ 
                url: this.tickerURL,
                qs: { market: 'USDT' },
                json: true
            }, (error, response, body) => {
                logger.debug(`got response ${response.statusCode} from ticker endpoint`)
                if (response.statusCode !== 200) {
                    return cb(error)
                }
                return cb(null, body)
            })
        }, (error, result) => {
            if (error) {
                logger.error(`Could not retrieve data from ${this.tickerURL}.`)
                return callback(error)
            }
            return callback(null, result)
        })
    }

    getBooksData(callback: (err: Error, result: any) => void) {
        async.series(_.reduce(this.pairs, (acc: { [s: string]: Function }, symbol: string) => {
            acc[symbol] = (cb: (err: Error, result: any) => void) => {
                async.retry({times: 5, interval: 1000 }, (cb1: Function) => {
                    logger.debug(`attempting retrieval of book data for ${symbol}`)
                    request.get({
                        url: this.booksURL,
                        qs: { symbol, limit: 200 },
                        json: true
                    }, (error, response, body) => {
                        logger.debug(`got response ${response.statusCode} from books endpoint for ${symbol}`)
                        setTimeout(() => {
                            if (response.statusCode !== 200) {
                                return cb1(error)
                            }
                            return cb1(null, body)
                        }, 1000)
                    })
                }, cb)
            }
            return acc
        }, {}), callback)
    }

    formatData(result: any): schema.KucoinTicker[] {
        return []
    }
}

export { Kucoin }