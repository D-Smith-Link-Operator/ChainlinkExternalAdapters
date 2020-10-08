const { logger } = require('@chainlink/external-adapter')
const { promisify } = require('util')
const { timeout } = require('promise-timeout')
const redis = require('redis')

// Connection
const DEFAULT_CACHE_REDIS_HOST = '127.0.0.1' // IP address of the Redis server
const DEFAULT_CACHE_REDIS_PORT = 6379 // Port of the Redis server
const DEFAULT_CACHE_REDIS_PATH = null // The UNIX socket string of the Redis server
const DEFAULT_CACHE_REDIS_URL = null // The URL of the Redis server
const DEFAULT_CACHE_REDIS_PASSWORD = '' // The password required for redis auth
const DEFAULT_CACHE_REDIS_TIMEOUT = 500 // Timeout in ms
// Options
const DEFAULT_CACHE_MAX_AGE = 1000 * 30 // Maximum age in ms

const env = process.env
const envOptions = () => ({
  host: env.CACHE_REDIS_HOST || DEFAULT_CACHE_REDIS_HOST,
  port: env.CACHE_REDIS_PORT || DEFAULT_CACHE_REDIS_PORT,
  path: env.CACHE_REDIS_PATH || DEFAULT_CACHE_REDIS_PATH,
  url: env.CACHE_REDIS_URL || DEFAULT_CACHE_REDIS_URL,
  password: env.CACHE_REDIS_PASSWORD || DEFAULT_CACHE_REDIS_PASSWORD,
  maxAge: Number(env.CACHE_MAX_AGE) || DEFAULT_CACHE_MAX_AGE,
  timeout: Number(env.CACHE_REDIS_TIMEOUT) || DEFAULT_CACHE_REDIS_TIMEOUT,
})

const retryStrategy = (options) => {
  logger.warn('Redis retry strategy activated.', options)
  if (options.error && options.error.code === 'ECONNREFUSED') {
    // End reconnecting on a specific error and flush all commands with
    // a individual error
    return new Error('The server refused the connection')
  }
  if (options.total_retry_time > 1000 * 60 * 60) {
    // End reconnecting after a specific timeout and flush all commands
    // with a individual error
    return new Error('Retry time exhausted')
  }
  if (options.attempt > 10) {
    // End reconnecting with built in error
    return undefined
  }
  // reconnect after
  return Math.min(options.attempt * 100, 3000)
}

class RedisCache {
  constructor(options) {
    this.options = options
    const client = redis.createClient({ ...options, retry_strategy: retryStrategy })
    client.on('error', (err) => logger.error('Error connecting to Redis. ', err))

    this._auth = promisify(client.auth).bind(client)
    this._get = promisify(client.get).bind(client)
    this._set = promisify(client.set).bind(client)
    this._del = promisify(client.del).bind(client)
    this.client = client
  }

  async connect() {
    if (!this.options.password) return
    return timeout(this._auth(this.options.password), this.options.timeout)
  }

  static async build(options) {
    const cache = new RedisCache(options)
    await cache.connect()
    return cache
  }

  async set(key, value, maxAge) {
    const entry = JSON.stringify(value)
    return timeout(this._set(key, entry, 'PX', maxAge), this.options.timeout)
  }

  async get(key) {
    const entry = await timeout(this._get(key), this.options.timeout)
    return JSON.parse(entry)
  }

  async del(key) {
    return timeout(this._del(key), this.options.timeout)
  }

  /**
   * Forcibly close the connection to the Redis server.
   *
   * AWS Lambda will timeout if the connection is not closed, because the connection
   * keeps the event loop busy.
   *
   * The alternative is to use: `context.callbackWaitsForEmtpyEventLoop = false`
   */
  async close() {
    // No further commands will be processed
    this.client.end(true)
  }
}

module.exports = {
  RedisCache,
  envOptions,
}
