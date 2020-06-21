const Koa = require('koa');
const LRU = require('lru-cache');
const intoStream = require('into-stream');
const request = require('supertest');
const test = require('ava');

const cash = require('..');

const createApp = function(c, opts) {
  const app = new Koa();
  app.use(
    cash(
      opts || {
        get(key) {
          return c.get(key);
        },
        set(key, value) {
          return c.set(key, value);
        }
      }
    )
  );
  return app;
};

test.cb('should pass the maxAge through ctx.cash=', t => {
  let set = false;

  const c = new LRU();
  const app = createApp(c, {
    get(key) {
      return c.get(key);
    },
    set(key, value, maxAge) {
      set = true;
      t.is(maxAge, 300);
      return c.set(key, value);
    }
  });

  app.use(async function(ctx) {
    if (await ctx.cashed()) return;
    ctx.cash = {
      maxAge: 300
    };
    ctx.body = 'lol';
  });

  request(app.listen())
    .get('/')
    .expect(200)
    .expect('lol', err => {
      if (err) return t.end(err);

      t.truthy(set);
      t.is(c.get('/').body, 'lol');
      t.end();
    });
});

test.cb('when body is a string it should cache the response', t => {
  const c = new LRU();
  const app = createApp(c);
  app.use(async function(ctx) {
    if (await ctx.cashed()) return;
    ctx.body = 'lol';
  });

  request(app.listen())
    .get('/')
    .expect(200)
    .expect('lol', err => {
      if (err) return t.end(err);

      t.is(c.get('/').body, 'lol');
      t.end();
    });
});

test.cb('when the body is a buffer it should cache the response', t => {
  const c = new LRU();
  const app = createApp(c);
  app.use(async function(ctx) {
    if (await ctx.cashed()) return;
    ctx.body = Buffer.from('lol');
  });

  request(app.listen())
    .get('/')
    .expect(200)
    .expect('lol', err => {
      if (err) return t.end(err);

      t.is(c.get('/').body.toString('utf8'), 'lol');
      t.end();
    });
});

test.cb('when the body is JSON it should cache the response', t => {
  const c = new LRU();
  const app = createApp(c);
  app.use(async function(ctx) {
    if (await ctx.cashed()) return;
    ctx.body = {
      message: 'hi'
    };
  });

  request(app.listen())
    .get('/')
    .expect(200)
    .expect('{"message":"hi"}', err => {
      if (err) return t.end(err);

      t.is(c.get('/').body, '{"message":"hi"}');
      t.end();
    });
});

test.cb('when the body is a stream it should cache the response', t => {
  const c = new LRU();
  const app = createApp(c);
  app.use(async function(ctx) {
    if (await ctx.cashed()) return;
    ctx.body = intoStream('lol');
  });

  request(app.listen())
    .get('/')
    .expect(200)
    .expect('lol', err => {
      if (err) return t.end(err);

      t.is(c.get('/').body.toString('utf8'), 'lol');
      t.end();
    });
});

test.cb('when the type is compressible it should compress the body', t => {
  const c = new LRU();
  const app = createApp(c);
  app.use(async function(ctx) {
    if (await ctx.cashed()) return;
    ctx.response.type = 'text/plain';
    ctx.body = Buffer.alloc(2048);
  });

  request(app.listen())
    .get('/')
    .expect('Content-Encoding', 'gzip')
    .expect(200, err => {
      if (err) return t.end(err);

      t.truthy(c.get('/').body);
      t.truthy(c.get('/').gzip);
      t.is(c.get('/').type, 'text/plain; charset=utf-8');
      t.end();
    });
});

test.cb(
  'when the type is compressible it should handle possible data serialisation and deserialisation',
  t => {
    const c = new LRU();
    const app = createApp(c, {
      get(key) {
        const value = c.get(key);
        return value && JSON.parse(value);
      },
      set(key, value) {
        return c.set(key, JSON.stringify(value));
      }
    });
    app.use(async function(ctx) {
      if (await ctx.cashed()) return;
      ctx.body = new Array(1024).join('42');
    });

    const server = app.listen();
    request(server)
      .get('/')
      .expect('Content-Encoding', 'gzip')
      .expect(200, (err, res1) => {
        if (err) return t.end(err);

        request(server)
          .get('/')
          .expect('Content-Encoding', 'gzip')
          .expect(200, (err, res2) => {
            if (err) return t.end(err);

            t.is(res1.text, res2.text);
            t.end();
          });
      });
  }
);

test.cb(
  'when the type is not compressible it should not compress the body',
  t => {
    const c = new LRU();
    const app = createApp(c);
    app.use(async function(ctx) {
      if (await ctx.cashed()) return;
      ctx.response.type = 'image/png';
      ctx.body = Buffer.alloc(2048);
    });

    request(app.listen())
      .get('/')
      .expect('Content-Encoding', 'identity')
      .expect(200, err => {
        if (err) return t.end(err);

        t.truthy(c.get('/').body);
        t.true(!c.get('/').gzip);
        t.is(c.get('/').type, 'image/png');
        t.end();
      });
  }
);

test.cb(
  'when the body is below the threshold it  should not compress the body',
  t => {
    const c = new LRU();
    const app = createApp(c);
    app.use(async function(ctx) {
      if (await ctx.cashed()) return;
      ctx.body = 'lol';
    });

    request(app.listen())
      .get('/')
      .expect('Content-Encoding', 'identity')
      .expect('lol')
      .expect(200, err => {
        if (err) return t.end(err);

        t.truthy(c.get('/').body);
        t.true(!c.get('/').gzip);
        t.is(c.get('/').type, 'text/plain; charset=utf-8');
        t.end();
      });
  }
);

test.cb('when the method is HEAD it should cache the response', t => {
  const c = new LRU();
  const app = createApp(c);
  app.use(async function(ctx) {
    if (await ctx.cashed()) return;
    ctx.body = 'lol';
  });

  request(app.listen())
    .head('/')
    .expect('')
    .expect(200, err => {
      if (err) return t.end(err);

      t.is(c.get('/').body, 'lol');
      t.is(c.get('/').type, 'text/plain; charset=utf-8');
      t.end();
    });
});

test.cb('when the method is POST it should not cache the response', t => {
  const c = new LRU();
  const app = createApp(c);
  app.use(async function(ctx) {
    if (await ctx.cashed()) return;
    ctx.body = 'lol';
  });

  request(app.listen())
    .post('/')
    .expect('lol')
    .expect(200, err => {
      if (err) return t.end(err);

      t.true(!c.get('/'));
      t.end();
    });
});

test.cb(
  'when the response code is not 200 it should not cache the response',
  t => {
    const c = new LRU();
    const app = createApp(c);
    app.use(async function(ctx) {
      if (await ctx.cashed()) return;
      ctx.body = 'lol';
      ctx.status = 201;
    });

    request(app.listen())
      .post('/')
      .expect('lol')
      .expect(201, err => {
        if (err) return t.end(err);

        t.true(!c.get('/'));
        t.end();
      });
  }
);

test.cb(
  'when etag and last-modified headers are set it should cache those values',
  t => {
    const c = new LRU();
    const app = createApp(c);
    const date = Math.round(Date.now() / 1000);
    app.use(async function(ctx) {
      if (await ctx.cashed()) return;
      ctx.body = 'lol';
      ctx.etag = 'lol';
      ctx.type = 'text/lol; charset=utf-8';
      ctx.lastModified = new Date(date * 1000);
    });

    request(app.listen())
      .get('/')
      .expect('lol')
      .expect(200, err => {
        if (err) return t.end(err);

        const obj = c.get('/');
        t.truthy(obj);
        t.is(obj.body, 'lol');
        t.is(obj.etag, '"lol"');
        t.is(obj.type, 'text/lol; charset=utf-8');
        t.is(obj.lastModified.getTime(), new Date(date * 1000).getTime());
        t.end();
      });
  }
);

test.cb(
  'when the response is fresh it should return a 304 and cache the response',
  t => {
    const c = new LRU();
    const app = createApp(c);
    const date = Math.round(Date.now() / 1000);
    app.use(async function(ctx) {
      if (await ctx.cashed()) return;
      ctx.body = 'lol';
      ctx.etag = 'lol';
      ctx.type = 'text/lol; charset=utf-8';
      ctx.lastModified = new Date(date * 1000);
    });

    const server = app.listen();
    request(server)
      .get('/')
      .set('If-None-Match', '"lol"')
      .expect('')
      .expect(304, err => {
        if (err) return t.end(err);

        const obj = c.get('/');
        t.truthy(obj);
        t.is(obj.body, 'lol');
        t.is(obj.etag, '"lol"');
        t.is(obj.type, 'text/lol; charset=utf-8');
        t.is(obj.lastModified.getTime(), new Date(date * 1000).getTime());
        t.end();
      });
  }
);
