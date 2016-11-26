'use strict'

/* eslint-env mocha */

const Koa = require('koa')
const assert = require('assert')
const cache = require('lru-cache')
const request = require('supertest')
const PassThrough = require('stream').PassThrough

const cash = require('..')

describe('when not cached', () => {
  it('should pass the maxAge through ctx.cash=', (done) => {
    const app = new Koa()
    const c = cache()
    let set = false

    app.use(cash({
      get (key) {
        return c.get(key)
      },
      set (key, value, maxAge) {
        set = true
        assert.equal(maxAge, 300)
        return c.set(key, value)
      }
    }))
    app.use(async function (ctx) {
      if (await ctx.cashed()) return
      ctx.cash = {
        maxAge: 300
      }
      ctx.body = 'lol'
    })

    request(app.listen())
    .get('/')
    .expect(200)
    .expect('lol', (err, res) => {
      if (err) return done(err)

      assert(set)
      assert.equal(c.get('/').body, 'lol')
      done()
    })
  })

  describe('when the body is a string', () => {
    it('should cache the response', (done) => {
      const app = new Koa()
      const c = cache()
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.body = 'lol'
      })

      request(app.listen())
      .get('/')
      .expect(200)
      .expect('lol', (err, res) => {
        if (err) return done(err)

        assert.equal(c.get('/').body, 'lol')
        done()
      })
    })
  })

  describe('when the body is a buffer', () => {
    it('should cache the response', (done) => {
      const app = new Koa()
      const c = cache()
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.body = new Buffer('lol')
      })

      request(app.listen())
      .get('/')
      .expect(200)
      .expect('lol', (err, res) => {
        if (err) return done(err)

        assert.equal(c.get('/').body.toString('utf8'), 'lol')
        done()
      })
    })
  })

  describe('when the body is JSON', () => {
    it('should cache the response', (done) => {
      const app = new Koa()
      const c = cache()
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.body = {
          message: 'hi'
        }
      })

      request(app.listen())
      .get('/')
      .expect(200)
      .expect('{"message":"hi"}', (err, res) => {
        if (err) return done(err)

        assert.equal(c.get('/').body, '{"message":"hi"}')
        done()
      })
    })
  })

  describe('when the body is a stream', () => {
    it('should cache the response', (done) => {
      const app = new Koa()
      const c = cache()
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.body = new PassThrough()
        ctx.body.end('lol')
      })

      request(app.listen())
      .get('/')
      .expect(200)
      .expect('lol', (err, res) => {
        if (err) return done(err)

        assert.equal(c.get('/').body.toString('utf8'), 'lol')
        done()
      })
    })
  })

  describe('when the type is compressible', () => {
    it('should compress the body', (done) => {
      const app = new Koa()
      const c = cache()
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.response.type = 'text/plain'
        ctx.body = new Buffer(2048)
      })

      request(app.listen())
      .get('/')
      .expect('Content-Encoding', 'gzip')
      .expect(200, (err, res) => {
        if (err) return done(err)

        assert(c.get('/').body)
        assert(c.get('/').gzip)
        assert.equal(c.get('/').type, 'text/plain; charset=utf-8')
        done()
      })
    })

    it('should handle possible data serialisation and deserialisation', (done) => {
      const app = new Koa()
      const c = cache()
      app.use(cash({
        get (key) {
          let value = c.get(key)
          return value && JSON.parse(value)
        },
        set (key, value) {
          return c.set(key, JSON.stringify(value))
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.body = Array(1024).join('42')
      })

      let server = app.listen()
      request(server)
      .get('/')
      .expect('Content-Encoding', 'gzip')
      .expect(200, (err, res1) => {
        if (err) return done(err)

        request(server)
        .get('/')
        .expect('Content-Encoding', 'gzip')
        .expect(200, (err, res2) => {
          if (err) return done(err)

          assert.equal(res1.text, res2.text)
          done()
        })
      })
    })
  })

  describe('when the type is not compressible', () => {
    it('should not compress the body', (done) => {
      const app = new Koa()
      const c = cache()
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.response.type = 'image/png'
        ctx.body = new Buffer(2048)
      })

      request(app.listen())
      .get('/')
      .expect('Content-Encoding', 'identity')
      .expect(200, (err, res) => {
        if (err) return done(err)

        assert(c.get('/').body)
        assert(!c.get('/').gzip)
        assert.equal(c.get('/').type, 'image/png')
        done()
      })
    })
  })

  describe('when the body is below the threshold', () => {
    it('should not compress the body', (done) => {
      const app = new Koa()
      const c = cache()
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.body = 'lol'
      })

      request(app.listen())
      .get('/')
      .expect('Content-Encoding', 'identity')
      .expect('lol')
      .expect(200, (err, res) => {
        if (err) return done(err)

        assert(c.get('/').body)
        assert(!c.get('/').gzip)
        assert.equal(c.get('/').type, 'text/plain; charset=utf-8')
        done()
      })
    })
  })

  describe('when the method is HEAD', () => {
    it('should cache the response', (done) => {
      const app = new Koa()
      const c = cache()
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.body = 'lol'
      })

      request(app.listen())
      .head('/')
      .expect('')
      .expect(200, (err, res) => {
        if (err) return done(err)

        assert.equal(c.get('/').body, 'lol')
        assert.equal(c.get('/').type, 'text/plain; charset=utf-8')
        done()
      })
    })
  })

  describe('when the method is POST', () => {
    it('should not cache the response', (done) => {
      const app = new Koa()
      const c = cache()
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.body = 'lol'
      })

      request(app.listen())
      .post('/')
      .expect('lol')
      .expect(200, (err, res) => {
        if (err) return done(err)

        assert(!c.get('/'))
        done()
      })
    })
  })

  describe('when the response code is not 200', () => {
    it('should not cache the response', (done) => {
      const app = new Koa()
      const c = cache()
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.body = 'lol'
        ctx.status = 201
      })

      request(app.listen())
      .post('/')
      .expect('lol')
      .expect(201, (err, res) => {
        if (err) return done(err)

        assert(!c.get('/'))
        done()
      })
    })
  })

  describe('when etag and last-modified headers are set', () => {
    it('should cache those values', (done) => {
      const app = new Koa()
      const c = cache()
      const date = Math.round(Date.now() / 1000)
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.body = 'lol'
        ctx.etag = 'lol'
        ctx.lastModified = new Date(date * 1000)
      })

      request(app.listen())
      .get('/')
      .expect('lol')
      .expect(200, (err, res) => {
        if (err) return done(err)

        const obj = c.get('/')
        assert(obj)
        assert.equal(obj.body, 'lol')
        assert.equal(obj.etag, '"lol"')
        assert.equal(obj.lastModified.getTime(), new Date(date * 1000).getTime())
        done()
      })
    })
  })

  describe('when the response is fresh', () => {
    it('should return a 304', (done) => {
      const app = new Koa()
      const c = cache()
      const date = Math.round(Date.now() / 1000)
      app.use(cash({
        get (key) {
          return c.get(key)
        },
        set (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        ctx.body = 'lol'
        ctx.etag = 'lol'
        ctx.lastModified = new Date(date * 1000)
      })

      request(app.listen())
      .get('/')
      .set('If-None-Match', '"lol"')
      .expect('')
      .expect(304, done)
    })
  })
})

describe('when cached', () => {
  const c = cache()
  const date = Math.round(Date.now() / 1000)
  const _cash = cash({
    get (key) {
      return c.get(key)
    },
    set (key, value) {
      return c.set(key, value)
    }
  })

  before((done) => {
    const app = new Koa()
    app.use(_cash)
    app.use(async function (ctx, next) {
      if (await ctx.cashed()) return
      ctx.body = 'lol'
      ctx.etag = 'lol'
      ctx.lastModified = new Date(date * 1000)
    })

    request(app.listen())
    .get('/')
    .expect(200, done)
  })

  describe('when the method is GET', () => {
    it('should serve from cache', (done) => {
      const app = new Koa()
      app.use(_cash)
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        throw new Error('wtf')
      })

      request(app.listen())
      .get('/')
      .expect(200)
      .expect('Content-Encoding', 'identity')
      .expect('ETag', '"lol"')
      .expect('lol', done)
    })
  })

  describe('when the method is POST', () => {
    it('should not serve from cache', (done) => {
      const app = new Koa()
      app.use(_cash)
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) throw new Error('wtf')
        ctx.body = 'lol'
      })

      request(app.listen())
      .post('/')
      .expect(200, done)
    })
  })

  describe('when the response is fresh', () => {
    it('should 304', (done) => {
      const app = new Koa()
      app.use(_cash)
      app.use(async function (ctx, next) {
        if (await ctx.cashed()) return
        throw new Error('wtf')
      })

      request(app.listen())
      .get('/')
      .set('If-None-Match', '"lol"')
      .expect(304, done)
    })
  })
})
