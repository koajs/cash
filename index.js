
var compressible = require('compressible')
var toArray = require('stream-to-array')
var compress = require('mz/zlib').gzip
var isJSON = require('koa-is-json')
var bytes = require('bytes')

// methods we cache
var methods = {
  HEAD: true,
  GET: true,
}

module.exports = function (options) {
  options = options || {}

  var hash = options.hash || function () { return this.request.url }
  var threshold = options.threshold || '1kb'
  if (typeof threshold === 'string') threshold = bytes(threshold)
  var get = options.get
  var set = options.set
  if (!get) throw new Error('.get not defined')
  if (!set) throw new Error('.set not defined')

  return function* cash(next) {
    this.vary('Accept-Encoding')
    this.cashed = cashed

    yield* next

    // check for HTTP caching just in case
    if (!this.cash) {
      if (this.request.fresh) this.response.status = 304
      return
    }

    // cache the response

    // only cache GET/HEAD 200s
    if (this.response.status !== 200) return
    if (!methods[this.request.method]) return
    var body = this.response.body
    if (!body) return

    // stringify JSON bodies
    if (isJSON(body)) body = this.response.body = JSON.stringify(body)
    // buffer streams
    if (typeof body.pipe === 'function') {
      // note: non-binary streams are NOT supported!
      body = this.response.body = Buffer.concat(yield toArray(body))
    }

    // avoid any potential errors with middleware ordering
    if (this.response.get('Content-Encoding') || 'identity' !== 'identity') {
      throw new Error('Place koa-cache below any compression middleware.')
    }

    var fresh = this.request.fresh
    if (fresh) this.response.status = 304

    var obj = {
      body: body,
      type: this.response.get('Content-Type') || null,
      lastModified: this.response.lastModified || null,
      etag: this.response.get('etag') || null,
    }

    if (compressible(obj.type) && this.response.length >= threshold) {
      obj.gzip = yield compress(body)
      if (!fresh
        && this.request.acceptsEncodings('gzip', 'identity') === 'gzip') {
        this.response.body = obj.gzip
        this.response.set('Content-Encoding', 'gzip')
      }
    }

    if (!this.response.get('Content-Encoding')) this.response.set('Content-Encoding', 'identity')

    yield set(this.cashKey, obj, this.cash.maxAge || options.maxAge || 0)
  }

  function* cashed(maxAge) {
    // uncacheable request method
    if (!methods[this.request.method]) return false

    var key = this.cashKey = hash.call(this, this)
    var obj = yield get(key, maxAge || options.maxAge || 0)
    var body = obj && obj.body
    if (!body) {
      // tell the upstream middleware to cache this response
      this.cash = { maxAge: maxAge }
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

    if (obj.gzip
      && this.request.acceptsEncodings('gzip', 'identity') === 'gzip') {
      this.response.body = obj.gzip
      this.response.set('Content-Encoding', 'gzip')
    } else {
      this.response.body = obj.body
      // tell any compress middleware to not bother compressing this
      this.response.set('Content-Encoding', 'identity')
    }

    return true
  }
}
