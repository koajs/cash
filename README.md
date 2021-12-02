# koa-cash

[![build status](https://img.shields.io/travis/koajs/cash.svg)](https://travis-ci.org/koajs/cash)
[![code coverage](https://img.shields.io/codecov/c/github/koajs/cash.svg)](https://codecov.io/gh/koajs/cash)
[![code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![made with lass](https://img.shields.io/badge/made_with-lass-95CC28.svg)](https://lass.js.org)
[![license](https://img.shields.io/github/license/koajs/cash.svg)](LICENSE)
[![npm downloads](https://img.shields.io/npm/dt/koa-cash.svg)](https://npm.im/koa-cash)

> HTTP response caching for Koa.  Supports Redis, in-memory store, and more!

Table of Contents

* [koa-cash](#koa-cash)
  * [Features](#features)
  * [Install](#install)
  * [Usage](#usage)
  * [API](#api)
    * [app.use(koaCash(options))](#appusekoacashoptions)
      * [`maxAge`](#maxage)
      * [`threshold`](#threshold)
      * [`compression`](#compression)
      * [`setCachedHeader`](#setcachedheader)
      * [`methods`](#methods)
      * [`hash()`](#hash)
      * [`get()`](#get)
      * [`set()`](#set)
      * [Example](#example)
    * [Max age (optional)](#max-age-optional)
    * [CashClear](#cashclear)
  * [Notes](#notes)
  * [Contributors](#contributors)
  * [License](#license)
  * [Links](#links)

## Features

Caches the response based on any arbitrary store you'd like.

* Handles JSON and stream bodies
* Handles gzip compression negotiation (if `options.compression` is set to `true` as of v4.0.0)
* Handles 304 responses

:tada: **Pairs great with [@ladjs/koa-cache-responses](https://github.com/ladjs/koa-cache-responses)** :tada:

## Install

[NPM](https://www.npmjs.com/)

```sh
npm install koa-cash
```

[Yarn](https://yarnpkg.com/)

```sh
yarn add koa-cash
```

## Usage

```js
import LRU from 'lru-cache';
import koaCash from 'koa-cash';

// ...
const cache = new LRU();
app.use(koaCash({
  get: (key) => {
    return cache.get(key);
  },
  set(key, value) {
    return cache.set(key, value);
  },
}))

app.use(async ctx => {
  // this response is already cashed if `true` is returned,
  // so this middleware will automatically serve this response from cache
  if (await ctx.cashed()) return;

  // set the response body here,
  // and the upstream middleware will automatically cache it
  ctx.body = 'hello world!';
});
```

## API

### app.use(koaCash(options))

Options are:

#### `maxAge`

Default max age (in milliseconds) for the cache if not set via `await ctx.cashed(maxAge)`.

#### `threshold`

Minimum byte size to compress response bodies. Default `1kb`.

#### `compression`

If a truthy value is passed, then compression will be enabled.  This value is `false` by default.

#### `setCachedHeader`

If a truthy value is passed, then `X-Cached-Response` header will be set as `HIT` when response is served from the cache.  This value is `false` by default.

#### `methods`

If an object is passed, then add extra HTTP method caching. This value is empty by default. But `GET` and `HEAD` are enabled.

Eg: `{ POST: true }`

#### `hash()`

A hashing function. By default, it's:

```js
function hash(ctx) {
 return ctx.response.url; // same as ctx.url
}
```

`ctx` is the Koa context and is also passed as an argument. By default, it caches based on the URL.

#### `get()`

Get a value from a store. Must return a Promise, which returns the cache's value, if any.

```js
function get(key, maxAge) {
  return Promise;
}
```

Note that all the `maxAge` stuff must be handled by you. This module makes no opinion about it.

#### `set()`

Set a value to a store. Must return a Promise.

```js
function set(key, value, maxAge) {
  return Promise;
}
```

Note: `maxAge` is set by `.cash = { maxAge }`. If it's not set, then `maxAge` will be `0`, which you should then ignore.

#### Example

Using a library like [lru-cache](https://github.com/isaacs/node-lru-cache), though this would not quite work since it doesn't allow per-key expiration times.

```js
const koaCash = require('koa-cash');
const LRU = require('lru-cache');

const cache = new LRU({
  maxAge: 30000 // global max age
})

app.use(koaCash({
  get (key, maxAge) {
    return cache.get(key)
  },
  set (key, value) {
    cache.set(key, value)
  }
}))
```

See [@ladjs/koa-cache-responses](https://github.com/ladjs/koa-cache-responses) test folder more examples (e.g. Redis with `ioredis`).

### Max age (optional)

```js
const cached = await ctx.cashed(maxAge) // maxAge is passed to your caching strategy
```

This is how you enable a route to be cached. If you don't call `await ctx.cashed()`, then this route will not be cached nor will it attempt to serve the request from the cache.

`maxAge` is the max age passed to `get()`.

If `cached` is `true`, then the current request has been served from cache and **you should early `return`**. Otherwise, continue setting `ctx.body=` and this will cache the response.

### CashClear

```js
ctx.cashClear('/')
```

This is a special method available on the ctx that you can use to clear the cache for a specific key.

## Notes

* Only `GET` and `HEAD` requests are cached. (Unless overridden)
* Only `200` responses are cached. Don't set `304` status codes on these routes - this middleware will handle it for you
* The underlying store should be able to handle `Date` objects as well as `Buffer` objects. Otherwise, you may have to serialize/deserialize yourself.

## Contributors

| Name             | Website                   |
| ---------------- | ------------------------- |
| **Jonathan Ong** | <http://jongleberry.com>  |
| **Nick Baugh**   | <http://niftylettuce.com> |

## License

[MIT](LICENSE) © [Jonathan Ong](http://jongleberry.com)

## Links

* [NPM](https://www.npmjs.com/)
* [Yarn](https://yarnpkg.com/)
