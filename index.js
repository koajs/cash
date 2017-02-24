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

  const hash = options.hash || function (ctx) { return ctx.request.url }
  let threshold = options.threshold || '1kb'
  if (typeof threshold === 'string') threshold = bytes(threshold)
  const get = options.get
  const set = options.set
  if (!get) throw new Error('.get not defined')
  if (!set) throw new Error('.set not defined')

  // ctx.cashed(maxAge) => boolean
  const cashed = async function cashed (ctx, maxAge) {
    // uncacheable request method
    if (!methods[ctx.request.method]) return false

    const key = ctx.cashKey = hash(ctx)
    const obj = await get(key, maxAge || options.maxAge || 0)
    const body = obj && obj.body
    if (!body) {
      // tell the upstream middleware to cache this response
      ctx.cash = { maxAge }
      return false
    }

    // serve from cache
    ctx.response.type = obj.type
    if (obj.lastModified) ctx.response.lastModified = obj.lastModified
    if (obj.etag) ctx.response.etag = obj.etag
    if (ctx.request.fresh) {
      ctx.response.status = 304
      return true
    }

    if (obj.gzip && ctx.request.acceptsEncodings('gzip', 'identity') === 'gzip') {
      ctx.response.body = new Buffer(obj.gzip)
      ctx.response.set('Content-Encoding', 'gzip')
    } else {
      ctx.response.body = obj.body
      // tell any compress middleware to not bother compressing this
      ctx.response.set('Content-Encoding', 'identity')
    }

    return true
  }

  // the actual middleware
  return async function cash (ctx, next) {
    ctx.vary('Accept-Encoding')
    ctx.cashed = function (maxAge) {
      return cashed(ctx, maxAge)
    }

    await next()

    // check for HTTP caching just in case
    if (!ctx.cash) {
      if (ctx.request.fresh) ctx.response.status = 304
      return
    }

    // cache the response

    // only cache GET/HEAD 200s
    if (ctx.response.status !== 200) return
    if (!methods[ctx.request.method]) return
    let body = ctx.response.body
    if (!body) return

    // stringify JSON bodies
    if (isJSON(body)) body = ctx.response.body = JSON.stringify(body)
    // buffer streams
    if (typeof body.pipe === 'function') {
      // note: non-binary streams are NOT supported!
      body = ctx.response.body = Buffer.concat(await toArray(body))
    }

    // avoid any potential errors with middleware ordering
    if ((ctx.response.get('Content-Encoding') || 'identity') !== 'identity') {
      throw new Error('Place koa-cache below any compression middleware.')
    }

    const obj = {
      body,
      type: ctx.response.get('Content-Type') || null,
      lastModified: ctx.response.lastModified || null,
      etag: ctx.response.get('etag') || null
    }

    const fresh = ctx.request.fresh
    if (fresh) ctx.response.status = 304

    if (compressible(obj.type) && ctx.response.length >= threshold) {
      obj.gzip = await compress(body)
      if (!fresh && ctx.request.acceptsEncodings('gzip', 'identity') === 'gzip') {
        ctx.response.body = obj.gzip
        ctx.response.set('Content-Encoding', 'gzip')
      }
    }

    if (!ctx.response.get('Content-Encoding')) ctx.response.set('Content-Encoding', 'identity')

    await set(ctx.cashKey, obj, ctx.cash.maxAge || options.maxAge || 0)
  }
}
