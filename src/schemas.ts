
enum ProducerEventType {
    exchange = 'EXCHANGE_TICKER'
}

interface ProducerPayload {
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
    book_buy: BookEntry[]
    book_sell: BookEntry[]
    trades?: Number
    eventType: ProducerEventType
}

interface BookEntry {
    price: number
    amount: number
    usd_total?: number
}

interface KucoinProducer extends ProducerPayload {
    exchange: 'Kucoin'
    eventType: ProducerEventType.exchange
}

interface Producer {

    produce: (data: KucoinProducer[]) => void

}

export { KucoinProducer, BookEntry, Producer, ProducerPayload, ProducerEventType }