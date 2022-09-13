const { gzip } = require('zlib');
const { promisify } = require('util');

const bytes = require('bytes');
const compressible = require('compressible');
const getStream = require('get-stream');
const isJSON = require('koa-is-json');
const isStream = require('is-stream');
const safeStringify = require('fast-safe-stringify');

const compress = promisify(gzip);

// methods we cache
const defaultMethods = {
  HEAD: true,
  GET: true
};

module.exports = function(options) {
  options = options || { compression: false, setCachedHeader: false };

  const methods = Object.assign(defaultMethods, options.methods);

  const hash =
    options.hash ||
    function(ctx) {
      return ctx.request.url;
    };

  const stringify = options.stringify || safeStringify || JSON.stringify;

  let threshold = options.threshold || '1kb';
  if (typeof threshold === 'string') threshold = bytes(threshold);
  const { get } = options;
  const { set } = options;
  if (!get) throw new Error('.get not defined');
  if (!set) throw new Error('.set not defined');

  // allow for manual cache clearing
  function cashClear(key) {
    // console.log(`Removing cache key: ${key}`);
    set(key, false);
  }

  // ctx.cashed(maxAge) => boolean
  async function cashed(maxAge) {
    // uncacheable request method
    if (!methods[this.request.method]) return false;

    this.cashKey = hash(this);
    const key = this.cashKey;
    const obj = await get(key, maxAge || options.maxAge || 0);
    const body = obj && obj.body;
    if (!body) {
      // tell the upstream middleware to cache this response
      this.cash = { maxAge };
      return false;
    }

    // serve from cache
    this.response.type = obj.type;
    if (obj.lastModified) this.response.lastModified = obj.lastModified;
    if (obj.etag) this.response.etag = obj.etag;
    if (options.setCachedHeader) this.response.set('X-Cached-Response', 'HIT');
    if (this.request.fresh) {
      this.response.status = 304;
      return true;
    }

    if (
      options.compression &&
      obj.gzip &&
      this.request.acceptsEncodings('gzip', 'identity') === 'gzip'
    ) {
      this.response.body = Buffer.from(obj.gzip);
      this.response.set('Content-Encoding', 'gzip');
    } else {
      this.response.body = obj.body;
      // tell any compress middleware to not bother compressing this
      if (options.compression) {
        this.response.set('Content-Encoding', 'identity');
      }
    }

    return true;
  }

  // the actual middleware
  // eslint-disable-next-line complexity
  async function middleware(ctx, next) {
    ctx.vary('Accept-Encoding');
    ctx.cashed = cashed.bind(ctx);
    ctx.cashClear = cashClear.bind(ctx);

    await next();

    // check for HTTP caching just in case
    if (!ctx.cash) {
      if (ctx.request.fresh) ctx.response.status = 304;
      return;
    }

    // cache the response

    // only cache GET/HEAD 200s
    if (ctx.response.status !== 200) return;
    if (!methods[ctx.request.method]) return;
    let { body } = ctx.response;
    if (!body) return;

    // stringify JSON bodies
    if (isJSON(body)) {
      ctx.response.body = stringify(body);
      body = ctx.response.body;
    } else if (isStream(body)) {
      // buffer streams
      ctx.response.body = await getStream.buffer(body);
      body = ctx.response.body;
    }

    // avoid any potential errors with middleware ordering
    if ((ctx.response.get('Content-Encoding') || 'identity') !== 'identity') {
      throw new Error('Place koa-cache below any compression middleware.');
    }

    const obj = {
      body,
      type: ctx.response.get('Content-Type') || null,
      lastModified: ctx.response.lastModified || null,
      etag: ctx.response.get('etag') || null
    };

    const { fresh } = ctx.request;
    if (fresh) ctx.response.status = 304;

    if (
      options.compression &&
      compressible(obj.type) &&
      ctx.response.length >= threshold
    ) {
      obj.gzip = await compress(body);
      if (
        !fresh &&
        ctx.request.acceptsEncodings('gzip', 'identity') === 'gzip'
      ) {
        ctx.response.body = obj.gzip;
        ctx.response.set('Content-Encoding', 'gzip');
      }
    }

    if (options.compression && !ctx.response.get('Content-Encoding'))
      ctx.response.set('Content-Encoding', 'identity');

    await set(ctx.cashKey, obj, ctx.cash.maxAge || options.maxAge || 0);
  }

  return middleware;
};
