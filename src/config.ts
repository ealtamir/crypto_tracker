import * as fs from 'fs'
import * as _ from 'lodash'
import * as process from 'process'


let CRYPTO_TRACKER_CONFIG_FILE_PATH = process.env.CRYPTO_TRACKER_CONFIG_FILE_PATH
let CRYPTO_TRACKER_SECRET_FILE_PATH = process.env.CRYPTO_TRACKER_SECRET_FILE_PATH

if (!CRYPTO_TRACKER_CONFIG_FILE_PATH) {
    throw new Error("CONFIG_FILE_PATH env variable should be set to the config file location")
}

if (!CRYPTO_TRACKER_SECRET_FILE_PATH)  {
    throw new Error("SECRET_FILE_PATH env variable should be set to the config file location")
}

let standard = JSON.parse(fs.readFileSync(CRYPTO_TRACKER_CONFIG_FILE_PATH, { encoding: 'utf8' }))
let secrets = JSON.parse(fs.readFileSync(CRYPTO_TRACKER_SECRET_FILE_PATH, { encoding: 'utf8' }))

const config = _.extend({secrets}, standard)

export { config }