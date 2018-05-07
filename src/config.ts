import * as fs from 'fs'
import * as _ from 'lodash'

let standard = JSON.parse(fs.readFileSync('config.json', { encoding: 'utf8' }))
let secrets = JSON.parse(fs.readFileSync('secrets.json', { encoding: 'utf8' }))

const config = _.extend({secrets}, standard)

export { config }