import { app } from './server'
import { Kucoin } from './data_sources/kucoin'


app.get('/', (req, res) => {
    res.end('OK')
})

let kucoin = new Kucoin(null)
kucoin.start()