import { app } from './server'
import { Kucoin } from './data_sources/kucoin'
import * as schema from './schemas'
import * as AWS from 'aws-sdk'
import { config } from './config'
import { logger } from './logging_tools'
import * as _ from 'lodash'


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

    produce(data: schema.ProducerPayload[]) {
        logger.info('Sending data payload to firehose')
        this.firehose.putRecord({
            DeliveryStreamName: config.aws.crypto_delivery_stream,
            Record: {
                Data: _.map(data, (payload) => {
                    JSON.stringify(payload)   
                }).join('\n')
            }
        }, (err: AWS.AWSError, result: AWS.Firehose.PutRecordOutput) => {
            if (err) {
                return logger.error(`There was an error when sending data to firehose ${JSON.stringify(err)}`);
            }
            return logger.info(`Successfully sent data to firehose ${JSON.stringify(result)}`)
        })
    }

}


let kucoin = new Kucoin(new FirehoseProducer(firehose))
kucoin.start()