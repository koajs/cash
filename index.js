'use strict'

const compressible = require('compressible')
const toArray = require('stream-to-array')
const isJSON = require('koa-is-json')
const Bluebird = require('bluebird')
const bytes = require('bytes')

const compress = Bluebird.promisify(require('zlib').gzip)

// methods we cache
const methods = {
  HEAD: true,
  GET: true
}

module.exports = function (options) {
  options = options || {}

  const hash = options.hash || function () { return this.request.url }
  let threshold = options.threshold || '1kb'
  if (typeof threshold === 'string') threshold = bytes(threshold)
  const get = options.get
  const set = options.set
  if (!get) throw new Error('.get not defined')
  if (!set) throw new Error('.set not defined')

  // this.cashed(maxAge) => boolean
  const cashed = Bluebird.coroutine(function * cashed (maxAge) {
    // uncacheable request method
    if (!methods[this.request.method]) return false

    const key = this.cashKey = hash.call(this, this)
    const obj = yield Promise.resolve(get(key, maxAge || options.maxAge || 0))
    const body = obj && obj.body
    if (!body) {
      // tell the upstream middleware to cache this response
      this.cash = { maxAge }
      return false
    }

    // serve from cache
    this.response.type = obj.type
    if (obj.lastModified) this.response.lastModified = obj.lastModified
    if (obj.etag) this.response.etag = obj.etag
    if (this.request.fresh) {
      this.response.status = 304
      return true
    }

    if (obj.gzip && this.request.acceptsEncodings('gzip', 'identity') === 'gzip') {
      this.response.body = new Buffer(obj.gzip)
      this.response.set('Content-Encoding', 'gzip')
    } else {
      this.response.body = obj.body
      // tell any compress middleware to not bother compressing this
      this.response.set('Content-Encoding', 'identity')
    }

    return true
  })

  // the actual middleware
  return function * cash (next) {
    this.vary('Accept-Encoding')
    this.cashed = cashed

    yield next

    // check for HTTP caching just in case
    if (!this.cash) {
      if (this.request.fresh) this.response.status = 304
      return
    }

    // cache the response

    // only cache GET/HEAD 200s
    if (this.response.status !== 200) return
    if (!methods[this.request.method]) return
    let body = this.response.body
    if (!body) return

    // stringify JSON bodies
    if (isJSON(body)) body = this.response.body = JSON.stringify(body)
    // buffer streams
    if (typeof body.pipe === 'function') {
      // note: non-binary streams are NOT supported!
      body = this.response.body = Buffer.concat(yield toArray(body))
    }

    // avoid any potential errors with middleware ordering
    if ((this.response.get('Content-Encoding') || 'identity') !== 'identity') {
      throw new Error('Place koa-cache below any compression middleware.')
    }

    const fresh = this.request.fresh
    if (fresh) this.response.status = 304

    const obj = {
      body,
      type: this.response.get('Content-Type') || null,
      lastModified: this.response.lastModified || null,
      etag: this.response.get('etag') || null
    }

    if (compressible(obj.type) && this.response.length >= threshold) {
      obj.gzip = yield compress(body)
      if (!fresh && this.request.acceptsEncodings('gzip', 'identity') === 'gzip') {
        this.response.body = obj.gzip
        this.response.set('Content-Encoding', 'gzip')
      }
    }

    if (!this.response.get('Content-Encoding')) this.response.set('Content-Encoding', 'identity')

    yield Promise.resolve(set(this.cashKey, obj, this.cash.maxAge || options.maxAge || 0))
  }
}
