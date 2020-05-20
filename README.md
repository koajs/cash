# koa-cash

[![build status](https://img.shields.io/travis/koajs/cash.svg)](https://travis-ci.org/koajs/cash)
[![code coverage](https://img.shields.io/codecov/c/github/koajs/cash.svg)](https://codecov.io/gh/koajs/cash)
[![code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![made with lass](https://img.shields.io/badge/made_with-lass-95CC28.svg)](https://lass.js.org)
[![license](https://img.shields.io/github/license/koajs/cash.svg)](LICENSE)
[![npm downloads](https://img.shields.io/npm/dt/koa-cash.svg)](https://npm.im/koa-cash)

> HTTP response caching for Koa.  Supports Redis, in-memory store, and more!


## Table of Contents

* [Features](#features)
* [Install](#install)
* [Usage](#usage)
* [API](#api)
  * [app.use(koaCash(options))](#appusekoacashoptions)
  * [const cached = await ctx.cashed(\[maxAge\])](#const-cached--await-ctxcashedmaxage)
* [Notes](#notes)
* [Usage](#usage-1)
* [Contributors](#contributors)
* [License](#license)


## Features

Caches the response based on any arbitrary store you'd like.

* Handles JSON and stream bodies
* Handles gzip compression negotiation
* Handles 304 responses

:tada: **Pairs great with [@ladjs/koa-cache-responses](https://github.com/ladjs/koa-cache-responses)** :tada:


## Install

[npm][]:

```sh
npm install koa-cash
```

[yarn][]:

```sh
yarn add koa-cash
```


## Usage

```js
const koaCash = require('koa-cash');

// ...

app.use(koaCash())

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

### const cached = await ctx.cashed(\[maxAge])

This is how you enable a route to be cached. If you don't call `await ctx.cashed()`, then this route will not be cached nor will it attempt to serve the request from the cache.

`maxAge` is the max age passed to `get()`.

If `cached` is `true`, then the current request has been served from cache and **you should early `return`**. Otherwise, continue setting `ctx.body=` and this will cache the response.


## Notes

* Only `GET` and `HEAD` requests are cached.
* Only `200` responses are cached. Don't set `304` status codes on these routes - this middleware will handle it for you
* The underlying store should be able to handle `Date` objects as well as `Buffer` objects. Otherwise, you may have to serialize/deserialize yourself.


## Usage


## Contributors

| Name             | Website                   |
| ---------------- | ------------------------- |
| **Jonathan Ong** | <http://jongleberry.com>  |
| **Nick Baugh**   | <http://niftylettuce.com> |


## License

[MIT](LICENSE) © [Jonathan Ong](http://jongleberry.com)


## 

[npm]: https://www.npmjs.com/

[yarn]: https://yarnpkg.com/
