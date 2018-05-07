import * as request from 'request'
import * as async from 'async'
import { logger } from '../logging_tools';
import * as _ from 'lodash'
import * as schema from '../schemas'
import moment from 'moment';

interface KucoinAPIPayload {
    success: boolean
    code: string
    msg: string
    timestamp: number
    data: KucoinTicker[] | KucoinBook
}
interface KucoinTicker {
    coinType: string
    trading: boolean
    symbol: string
    lastDealPrice: number
    buy: number
    sell: number
    change: number
    coinTypePair: string
    sort: number
    feeRate: number
    volValue: number
    high: number
    datetime: number
    vol: number
    low: number
    changeRate: number
}
interface KucoinBook {
    SELL: Number[][]
    BUY: Number[][]
}

class Kucoin {

    // amount of milliseconds in 5 minutes
    interval: number = 1000 * 60 * 2
    exchangeName: string = 'KUCOIN'
    intervalObject: NodeJS.Timer
    
    tickerURL: string = 'https://api.kucoin.com/v1/market/open/symbols'
    booksURL: string = 'https://api.kucoin.com/v1/open/orders'

    producer: schema.Producer

    pairs: string[] = [
        "BTC-USDT", "ETH-USDT", "BCH-USDT",
        "NEO-USDT", "KCS-USDT", "CS-USDT",
        "ACT-USDT", "HSR-USDT", "LYM-USDT",
        "TKY-USDT", "XRB-USDT", "DRGN-USDT",
        "LTC-USDT", "EOS-USDT"
    ]

    constructor(producer: schema.Producer) {
        this.producer = producer
    }

    start() {
        logger.debug('starting kucoin crawler')
        this.triggerDataDownload()
        this.intervalObject = setInterval(_.bind(this.triggerDataDownload, this), this.interval)
    }
    
    triggerDataDownload() {
        async.series({
            ticker: _.bind(this.getTickerData, this),
            books: _.bind(this.getBooksData, this)
        }, (error: Error, result: any) => {
            if (error) {
                return logger.error(`Got an error when triggering data fetch on Kucoin: ${JSON.stringify(error)}`)
            }
            return this.producer.produce(this.formatData(result))
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
                if (response.statusCode !== 200 || !body.success) {
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
                            if (response.statusCode !== 200 || !body.success) {
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

    formatData(result: any): schema.KucoinProducer[] {
        const ticker: KucoinAPIPayload = <KucoinAPIPayload>result.ticker
        const book: { [pair: string]: KucoinAPIPayload } = result.books
        const toBookEntries = (data: Number[][]): schema.BookEntry[] => {
            return _.map(data, (el: Number[]) => {
                return <schema.BookEntry>{ price: el[0], amount: el[1], usd_total: el[2] } 
            })
        }
        const timestamp = moment().toISOString()
        const data = _.map(ticker.data, (tickerData: KucoinTicker) => {
            try {
                const bookApiPayload = <KucoinAPIPayload>book[tickerData.symbol]
                const bookData: KucoinBook = <KucoinBook>bookApiPayload.data
                return <schema.KucoinProducer>{
                    exchange: this.exchangeName,
                    symbol: tickerData.coinType,
                    name: tickerData.coinType,
                    pair: tickerData.symbol,
                    timestamp: timestamp,
                    volume_USD: tickerData.volValue,
                    buy: tickerData.buy,
                    sell: tickerData.sell,
                    high: tickerData.high,
                    low: tickerData.low,
                    book_buy: toBookEntries(bookData.BUY),
                    book_sell: toBookEntries(bookData.SELL),
                    spread: Math.abs(tickerData.sell - tickerData.buy),
                    eventType: schema.ProducerEventType.exchange
                }
            } catch (e) {
                logger.error(`Got error when building producer payload for ${tickerData.symbol} in KUCOIN: ${JSON.stringify(e)}`)
                return null
            }
        })
        return _.filter(data, el => { return !!el })
    }
}

export { Kucoin }