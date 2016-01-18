# Koa Cash

[![NPM version][npm-image]][npm-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]
[![Dependency Status][david-image]][david-url]
[![License][license-image]][license-url]
[![Downloads][downloads-image]][downloads-url]

HTTP response caching for Koa.
Caches the response based on any arbitrary store you'd like.

- Handles JSON and stream bodies
- Handles gzip compression negotiation
- Handles 304 responses

```js
app.use(require('koa-cash')({
  // some options
}))

app.use(function* (next) {
  // this response is already cashed if `true` is returned,
  // so this middleware will automatically serve this response from cache
  if (yield this.cashed()) return

  // set the response body here,
  // and the upstream middleware will automatically cache it
  this.response.body = 'hello world!'
})
```

## API

### app.use(require('koa-cash')(options))

Options are:

#### `maxAge`

Default max age for the cache if not set via `yield this.cashed(maxAge)`.

#### `threshold`

Minimum byte size to compress response bodies. Default `1kb`.

#### `hash()`

A hashing function. By default, it's:

```js
function hash(_this) {
  return this.request.url
}
```

`this` is the Koa context and is also passed as an argument.
By default, it caches based on the URL.

#### `get()`

Get a value from a store. Must return a "yieldable", which returns the cache's value, if any.

```js
function get(key, maxAge) {
  return <yieldable>
}
```

Note that all the `maxAge` stuff must be handled by you.
This module makes no opinion about it.

#### `set()`

Set a value to a store. Must return a "yieldable".

```js
function set(key, value, maxAge) {
  return <yieldable>
}
```

Note: `maxAge` is set by `.cash={ maxAge }`.
If it's not set, then `maxAge` will be `0`, which you should then ignore.

#### Example

Using a library like [lru-cache](https://github.com/isaacs/node-lru-cache),
though this would not quite work since it doesn't allow per-key expiration times.

```js
var cache = require('lru-cache')({
  maxAge: 30000 // global max age
})

app.use(require('koa-cash')({
  get (key, maxAge) {
    return cache.get(key)
  },
  set (key, value) {
    cache.set(key, value)
  }
}))
```

### var cached = yield this.cashed([maxAge])

This is how you enable a route to be cached.
If you don't call `yield this.cashed()`,
then this route will not be cached nor will it attempt to serve the request from the cache.

`maxAge` is the max age passed to `get()`.

If `cached` is `true`,
then the current request has been served from cache and __you should early `return`__.
Otherwise, continue setting `this.response.body=` and this will cache the response.

## Notes

- Only `GET` and `HEAD` requests are cached.
- Only `200` responses are cached.
  Don't set `304` status codes on these routes - this middleware will handle it for you
- The underlying store should be able to handle `Date` objects as well as `Buffer` objects.
  Otherwise, you may have to serialize/deserialize yourself.

[npm-image]: https://img.shields.io/npm/v/koa-cash.svg?style=flat-square
[npm-url]: https://npmjs.org/package/koa-cash
[github-tag]: http://img.shields.io/github/tag/koajs/cash.svg?style=flat-square
[github-url]: https://github.com/koajs/cash/tags
[travis-image]: https://img.shields.io/travis/koajs/cash.svg?style=flat-square
[travis-url]: https://travis-ci.org/koajs/cash
[coveralls-image]: https://img.shields.io/coveralls/koajs/cash.svg?style=flat-square
[coveralls-url]: https://coveralls.io/r/koajs/cash?branch=master
[david-image]: http://img.shields.io/david/koajs/cash.svg?style=flat-square
[david-url]: https://david-dm.org/koajs/cash
[license-image]: http://img.shields.io/npm/l/koa-cash.svg?style=flat-square
[license-url]: LICENSE
[downloads-image]: http://img.shields.io/npm/dm/koa-cash.svg?style=flat-square
[downloads-url]: https://npmjs.org/package/koa-cash
