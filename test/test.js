
var koa = require('koa')
var assert = require('assert')
var cache = require('lru-cache')
var request = require('supertest')
var PassThrough = require('stream').PassThrough

var cash = require('..')

describe('when not cached', function () {
  it('should pass the maxAge through this.cash=', function (done) {
    var app = koa()
    var c = cache()
    var set = false

    app.use(cash({
      get: function* (key) {
        return c.get(key)
      },
      set: function* (key, value, maxAge) {
        set = true
        assert.equal(maxAge, 300)
        return c.set(key, value)
      }
    }))
    app.use(function* (next) {
      if (yield* this.cashed()) return
      this.cash = {
        maxAge: 300
      }
      this.body = 'lol'
    })

    request(app.listen())
    .get('/')
    .expect(200)
    .expect('lol', function (err, res) {
      if (err) return done(err)

      assert(set)
      assert.equal(c.get('/').body, 'lol')
      done()
    })
  })

  describe('when the body is a string', function () {
    it('should cache the response', function (done) {
      var app = koa()
      var c = cache()
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.body = 'lol'
      })

      request(app.listen())
      .get('/')
      .expect(200)
      .expect('lol', function (err, res) {
        if (err) return done(err)

        assert.equal(c.get('/').body, 'lol')
        done()
      })
    })
  })

  describe('when the body is a buffer', function () {
    it('should cache the response', function (done) {
      var app = koa()
      var c = cache()
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.body = new Buffer('lol')
      })

      request(app.listen())
      .get('/')
      .expect(200)
      .expect('lol', function (err, res) {
        if (err) return done(err)

        assert.equal(c.get('/').body.toString('utf8'), 'lol')
        done()
      })
    })
  })

  describe('when the body is JSON', function () {
    it('should cache the response', function (done) {
      var app = koa()
      var c = cache()
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.body = {
          message: 'hi'
        }
      })

      request(app.listen())
      .get('/')
      .expect(200)
      .expect('{"message":"hi"}', function (err, res) {
        if (err) return done(err)

        assert.equal(c.get('/').body, '{"message":"hi"}')
        done()
      })
    })
  })

  describe('when the body is a stream', function () {
    it('should cache the response', function (done) {
      var app = koa()
      var c = cache()
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.body = new PassThrough()
        this.body.end('lol')
      })

      request(app.listen())
      .get('/')
      .expect(200)
      .expect('lol', function (err, res) {
        if (err) return done(err)

        assert.equal(c.get('/').body.toString('utf8'), 'lol')
        done()
      })
    })
  })

  describe('when the type is compressible', function () {
    it('should compress the body', function (done) {
      var app = koa()
      var c = cache()
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.response.type = 'text/plain'
        this.body = new Buffer(2048)
      })

      request(app.listen())
      .get('/')
      .expect('Content-Encoding', 'gzip')
      .expect(200, function (err, res) {
        if (err) return done(err)

        assert(c.get('/').body)
        assert(c.get('/').gzip)
        assert.equal(c.get('/').type, 'text/plain; charset=utf-8')
        done()
      })
    })
  })

  describe('when the type is not compressible', function () {
    it('should not compress the body', function (done) {
      var app = koa()
      var c = cache()
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.response.type = 'image/png'
        this.body = new Buffer(2048)
      })

      request(app.listen())
      .get('/')
      .expect('Content-Encoding', 'identity')
      .expect(200, function (err, res) {
        if (err) return done(err)

        assert(c.get('/').body)
        assert(!c.get('/').gzip)
        assert.equal(c.get('/').type, 'image/png')
        done()
      })
    })
  })

  describe('when the body is below the threshold', function () {
    it('should not compress the body', function (done) {
      var app = koa()
      var c = cache()
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.body = 'lol'
      })

      request(app.listen())
      .get('/')
      .expect('Content-Encoding', 'identity')
      .expect('lol')
      .expect(200, function (err, res) {
        if (err) return done(err)

        assert(c.get('/').body)
        assert(!c.get('/').gzip)
        assert.equal(c.get('/').type, 'text/plain; charset=utf-8')
        done()
      })
    })
  })

  describe('when the method is HEAD', function () {
    it('should cache the response', function (done) {
      var app = koa()
      var c = cache()
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.body = 'lol'
      })

      request(app.listen())
      .head('/')
      .expect('')
      .expect(200, function (err, res) {
        if (err) return done(err)

        assert.equal(c.get('/').body, 'lol')
        assert.equal(c.get('/').type, 'text/plain; charset=utf-8')
        done()
      })
    })
  })

  describe('when the method is POST', function () {
    it('should not cache the response', function (done) {
      var app = koa()
      var c = cache()
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.body = 'lol'
      })

      request(app.listen())
      .post('/')
      .expect('lol')
      .expect(200, function (err, res) {
        if (err) return done(err)

        assert(!c.get('/'))
        done()
      })
    })
  })

  describe('when the response code is not 200', function () {
    it('should not cache the response', function (done) {
      var app = koa()
      var c = cache()
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.body = 'lol'
        this.status = 201
      })

      request(app.listen())
      .post('/')
      .expect('lol')
      .expect(201, function (err, res) {
        if (err) return done(err)

        assert(!c.get('/'))
        done()
      })
    })
  })

  describe('when etag and last-modified headers are set', function () {
    it('should cache those values', function (done) {
      var app = koa()
      var c = cache()
      var date = Math.round(Date.now() / 1000)
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.body = 'lol'
        this.etag = 'lol'
        this.lastModified = new Date(date * 1000)
      })

      request(app.listen())
      .get('/')
      .expect('lol')
      .expect(200, function (err, res) {
        if (err) return done(err)

        var obj = c.get('/')
        assert(obj)
        assert.equal(obj.body, 'lol')
        assert.equal(obj.etag, '"lol"')
        assert.equal(obj.lastModified.getTime(), new Date(date * 1000).getTime())
        done()
      })
    })
  })

  describe('when the response is fresh', function () {
    it('should return a 304', function (done) {
      var app = koa()
      var c = cache()
      var date = Math.round(Date.now() / 1000)
      app.use(cash({
        get: function* (key) {
          return c.get(key)
        },
        set: function* (key, value) {
          return c.set(key, value)
        }
      }))
      app.use(function* (next) {
        if (yield* this.cashed()) return
        this.body = 'lol'
        this.etag = 'lol'
        this.lastModified = new Date(date * 1000)
      })

      request(app.listen())
      .get('/')
      .set('If-None-Match', '"lol"')
      .expect('')
      .expect(304, done)
    })
  })
})

describe('when cached', function () {
  var c = cache()
  var date = Math.round(Date.now() / 1000)
  var _cash = cash({
    get: function* (key) {
      return c.get(key)
    },
    set: function* (key, value) {
      return c.set(key, value)
    }
  })

  before(function (done) {
    var app = koa()
    app.use(_cash)
    app.use(function* (next) {
      if (yield* this.cashed()) return
      this.body = 'lol'
      this.etag = 'lol'
      this.lastModified = new Date(date * 1000)
    })

    request(app.listen())
    .get('/')
    .expect(200, done)
  })

  describe('when the method is GET', function () {
    it('should serve from cache', function (done) {
      var app = koa()
      app.use(_cash)
      app.use(function* (next) {
        if (yield* this.cashed()) return
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

  describe('when the method is POST', function () {
    it('should not serve from cache', function (done) {
      var app = koa()
      app.use(_cash)
      app.use(function* (next) {
        if (yield* this.cashed()) throw new Error('wtf')
        this.body = 'lol'
      })

      request(app.listen())
      .post('/')
      .expect(200, done)
    })
  })

  describe('when the response is fresh', function () {
    it('should 304', function (done) {
      var app = koa()
      app.use(_cash)
      app.use(function* (next) {
        if (yield* this.cashed()) return
        throw new Error('wtf')
      })

      request(app.listen())
      .get('/')
      .set('If-None-Match', '"lol"')
      .expect(304, done)
    })
  })
})

function noop() {}
