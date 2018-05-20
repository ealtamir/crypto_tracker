import { app } from './server'
import { Kucoin } from './data_sources/kucoin'
import { Bitfinex } from './data_sources/bitfinex'
import * as schema from './schemas'
import * as AWS from 'aws-sdk'
import { config } from './config'
import { logger, dogstatsd } from './logging_tools'
import * as _ from 'lodash'
import * as request from 'request'


app.get('/', (req, res) => {
    res.end('OK')
})

const firehose = new AWS.Firehose({
    accessKeyId: config.secrets.accessKeyId,
    secretAccessKey: config.secrets.secretAccessKey,
    region: config.secrets.region
})

class FirehoseProducer implements schema.Producer {

    firehose: AWS.Firehose

    constructor(firehose: AWS.Firehose) {
        this.firehose = firehose
    }

    produce(data: schema.ProducerPayload[], tag?: string) {
        logger.info('Sending data payload to firehose')
        const payloadSize = data.length
        const dataRecords = _.map(data, (payload, index) => {
                return {
                    Data: JSON.stringify(payload) + '\n'
                }
            })
        this.firehose.putRecordBatch({
            DeliveryStreamName: config.aws.crypto_delivery_stream,
            Records: dataRecords
        }, (err: AWS.AWSError, result: AWS.Firehose.PutRecordBatchOutput) => {
            if (err) {
                dogstatsd.increment('firehose.error')
                return logger.error(`There was an error when sending data from ${tag} to firehose ${JSON.stringify(err)}`);
            }
            return logger.info(`>>> Successfully sent ${payloadSize} data items from ${tag} to firehose`)
        })
    }
}


const firehoseProducer = new FirehoseProducer(firehose)

const kucoin = new Kucoin(new FirehoseProducer(firehose))
kucoin.start()
const bitfinex = new Bitfinex(firehoseProducer)
bitfinex.start()