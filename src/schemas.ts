
abstract class Ticker {
    name: String
    symbol: String
    pair: String
    timestamp: String
    volume_USD: Number
    buy: Number
    sell: Number
    spread: Number
    high: Number
    low: Number
    book_buy_log: Number[]
    book_sell_log: Number[]
    trades: Number
}

class KucoinTicker extends Ticker {
    exchange: 'Kucoin'
}

export { KucoinTicker }