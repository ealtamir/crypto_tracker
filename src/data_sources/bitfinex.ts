
import * as request from 'request'
import * as _ from 'lodash'
import * as async from 'async'
import moment from 'moment';

import * as def from './definitions'
import * as schemas from '../schemas'
import { logger } from '../logging_tools'

const WebSocket = require('ws')

enum INFO_CODES {
    RESTART_ENGINE = 20059,
    SUSPEND_ENGINE = 20060,
    RESUME_ENGINE = 20061
}
interface Message {
    event: string
}
interface InfoMessage extends Message {
    event: 'info'
    version?: string
    code?: number
    msg?: string
    platform?: any
}
interface TickerSubscribeMessage extends Message {
    event: "subscribe"
    channel: "ticker"
    pair: string
}
interface TickerSubscribeResponseMessage extends TickerSubscribeMessage{
    chanId: number
}
interface TickerUpdate {
    channel_id: number
    bid: number
    bid_size: number
    ask: number
    ask_size: number
    daily_change: number
    daily_change_perc: number
    last_price: number
    volume: number
    high: number
    low: number
}
interface BookEntry {
    price: number
    amount: number
    timestamp: string
}
interface BookData {
    bids: BookEntry[]
    asks: BookEntry[]
}

class Bitfinex implements def.DataSource {

    private interval: number = 1000 * 60 * 2
    private symbolsURL: string = "https://api.bitfinex.com/v1/symbols"
    private websocketURL: string = "wss://api.bitfinex.com/ws"
    private booksURL: string = 'https://api.bitfinex.com/v1/book/'

    private producer: schemas.Producer
    private symbols: string[]
    private wss: WebSocket


    private channelPairMap: { [channel: number]: string }
    private pairSymbolMap: { [pair: string]: string }
    private pairLatestTicker: { [pair: string]: TickerUpdate }

    private mainLoopInterval: any

    constructor(producer: schemas.Producer) {
        this.producer = producer
        this.channelPairMap = {}
        this.pairSymbolMap = {}
        this.pairLatestTicker = {}
    }

    start() {
        this.getSymbols(this.symbolsURL, (err, response, body) => {
            if (err) {
                return logger.error(`There was an error retrieving bitfinex symbols: ${JSON.stringify(err)}`)
            }
            if (!body) {
                return logger.info("Got a request with an empty body from bitfinex")
            }
            this.symbols = _.filter(<string[]>body, (symbol: string) => {
                return symbol.toUpperCase().endsWith("USD")
            })
            this.symbols.forEach(pair => {
                this.pairSymbolMap[pair] = pair.slice(0, -3)
            })
            this.initWebsocket()
            this.startProducerLoop()
        })
    }

    stop(callback: () => void) {
        this.stopEngine(callback)
    }

    private startProducerLoop() {
        this.mainLoopInterval = setInterval(() => {
            this.submitDataToProducer()
        }, this.interval)
    }

    private submitDataToProducer() {
        type AsyncCallback = async.AsyncResultCallback<schemas.ProducerPayload, any>
        const symbolPairs: string[] = Object.keys(this.pairLatestTicker)
        async.parallel(_.map(symbolPairs, symbolPair => {
            return async.reflect((callback: AsyncCallback) => {
                const tickerUpdate: TickerUpdate = this.pairLatestTicker[symbolPair]
                const channelId = tickerUpdate.channel_id
                const pair = symbolPair
                const name = pair.slice(0, -3)
                const buildProducerObject = (cb: AsyncCallback) => {
                    request.get({
                        qs: { limit_bids: 50, limit_asks: 50 },
                        uri: `${this.booksURL}/${pair}`, 
                        json: true
                    }, (error, response, body) => {
                        if (error) {
                            logger.error(`Failed to fetch book data from bitfinex: ${JSON.stringify(error)}`)
                            return cb(error)
                        }
                        const bookData = <BookData>body
                        cb(null, <schemas.BitfinexProducer>{
                            name,
                            symbol: name,
                            pair,
                            timestamp: moment().toISOString(),
                            volume_USD: tickerUpdate.volume,
                            buy: tickerUpdate.bid,
                            sell: tickerUpdate.ask,
                            high: tickerUpdate.high,
                            low: tickerUpdate.low,
                            spread: tickerUpdate.bid - tickerUpdate.ask,
                            book_buy: this.toBookEntry(bookData.bids),
                            book_sell: this.toBookEntry(bookData.asks),
                            eventType: schemas.ProducerEventType.exchange,
                            exchange: 'Bitfinex'
                        })
                    })
                }
                async.retry({ times: 2, interval: 5 }, buildProducerObject, callback)
            })
        }), (error: Error, results: { error: any, value: schemas.BitfinexProducer }[]) => {
            if (error) {
                return logger.error(`Failed to build bitfinex data for producer: ${JSON.stringify(error)}`)
            }

            const processedResults = _.filter(_.map(results, payload => {
                return payload.value
            }), o => { return !!o })

            this.sendDataToProducer(processedResults)
        })
    }

    private sendDataToProducer(data: schemas.BitfinexProducer[]) {
        this.producer.produce(data, 'BITFINEX')
    }

    private toBookEntry(entries: BookEntry[]): schemas.BookEntry[] {
        return _.map(entries, (entry: BookEntry) => {
            return <schemas.BookEntry>{ 
                price: entry.price, 
                amount: entry.amount,
                usd_total: entry.price * entry.amount 
            }
        })
    }

    private initWebsocket() {
        this.wss = new WebSocket(this.websocketURL)
        this.wss.onmessage = _.bind(this.processMessage, this)
        async.series(_.map(this.symbols, symbol => {
            return (cb: async.AsyncResultCallback<any, any>) => {
                setTimeout(() => {
                    this.subscribePair(symbol)
                    cb()
                }, 1000)
            }
        }), null)
        this.symbols.forEach(symbol => {
            this.subscribePair(symbol)
        })
    }

    private processMessage(msg: { data: string }) {
        const payload: any = JSON.parse(msg.data)
        if (!_.isArray(payload) && _.isObject(payload)) {
            const event = <Message>payload
            this.processEvent(event)
        } else if (_.isArray(payload)) {
            const ticker = <any[]>payload
            if (this.isNotHeartbeat(ticker)) {
                this.processTickerUpdate(<number[]>ticker)
            }
        } else {
            logger.error(`Unknown bitfinex message type: ${JSON.stringify(msg.data)}.`)
        }
    }

    // 20051 : Stop/Restart Websocket Server (please try to reconnect)
    // 20060 : Refreshing data from the Trading Engine. Please pause any activity and resume after receiving the info message 20061 (it should take 10 seconds at most).
    // 20061 : Done Refreshing data from the Trading Engine. You can resume normal activity. It is advised to unsubscribe/subscribe again all channels.
    private processEvent(message: Message) {
        if (message.event === 'subscribed') {
            const payload = <TickerSubscribeResponseMessage> message
            this.channelPairMap[payload.chanId] = payload.pair
        } else if (message.event === 'info') {
            const payload = <InfoMessage>message
            if (payload.code === INFO_CODES.RESTART_ENGINE) {
                this.restartEngine()
            } else if (payload.code === INFO_CODES.SUSPEND_ENGINE) {
                // do nothing for now
            } else if (payload.code === INFO_CODES.RESUME_ENGINE) {
                // do nothing for now
            } else {
                logger.error(`Received invalid info code form bitfinex: ${payload.code}`)
            }
        }
    }

    private restartEngine() {
        this.stopEngine(() => {
            this.start()
        })
    }

    private stopEngine(callback: () => void) {
        clearInterval(this.mainLoopInterval)
        this.wss.close()
        this.wss.onclose = () => {
            this.channelPairMap = {}
            this.pairSymbolMap = {}
            this.pairLatestTicker = {}
            callback()
        }
    }

    private processTickerUpdate(payload: number[]) {
        const tickerUpdate: TickerUpdate  = this.generateTickerUpdate(payload)
        const channelId = tickerUpdate.channel_id
        const pair = this.channelPairMap[channelId]
        this.pairLatestTicker[pair] = tickerUpdate
        logger.debug(`Updated bitfinex ticker data for ${pair}`)
    }

    private generateTickerUpdate(payload: number[]): TickerUpdate {
        return <TickerUpdate>{
            channel_id: payload[0],
            bid: payload[1],
            bid_size: payload[2],
            ask: payload[3],
            ask_size: payload[4],
            daily_change: payload[5],
            daily_change_perc: payload[6],
            last_price: payload[7],
            volume: payload[8],
            high: payload[9],
            low: payload[10]
        }
    }

    private isNotHeartbeat(ticker: any[]) {
        return !(ticker.length === 2 && <string>ticker[1] === "hb")
    }

    private subscribePair(pair: string) {
        if (!_.includes(this.symbols, pair)) {
            throw new Error("pair doesnt exist in symbols array")
        }
        const event = JSON.stringify({
            event: "subscribe",
            channel: "ticker",
            pair
        })
        if (this.wss.readyState === this.wss.OPEN) {
            this.wss.send(event)
        } else {
            this.wss.onopen = () => {
                this.wss.send(event)
                this.wss.onopen = undefined
            }
        }
        logger.debug(`Subscribed to bitfinex socket: ${pair}`)
    }

    private getSymbols(url: string, callback: request.RequestCallback): void {
        request.get({ url, json: true }, callback)
    }

}

export { Bitfinex }