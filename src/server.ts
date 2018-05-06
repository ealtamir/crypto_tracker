import { Application } from "express-serve-static-core";
import { Express } from "express";
import { logger } from './logging_tools'

const Express = require('express')
const app: Application = Express()

const port = 3000
app.listen(port, () => {
    logger.info(`Initializing server at port ${port}.`)    
})

export { app }