const LRU = require('lru-cache');
const Koa = require('koa');
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

const c = new LRU();
const date = Math.round(Date.now() / 1000);

test.before.cb(t => {
  const app = createApp(c);
  app.use(async function(ctx) {
    if (await ctx.cashed()) return;
    ctx.body = 'lol';
    ctx.etag = 'lol';
    ctx.type = 'text/lol; charset=utf-8';
    ctx.lastModified = new Date(date * 1000);
  });

  request(app.listen())
    .get('/')
    .expect(200, t.end);
});

test.cb('when cached when the method is GET it should serve from cache', t => {
  const app = createApp(c);
  app.use(async function(ctx) {
    if (await ctx.cashed()) return;
    throw new Error('wtf');
  });

  request(app.listen())
    .get('/')
    .expect(200)
    .expect('Content-Type', 'text/lol; charset=utf-8')
    .expect('Content-Encoding', 'identity')
    .expect('ETag', '"lol"')
    .expect('lol', t.end);
});

test.cb(
  'when cached when the method is POST it should not serve from cache',
  t => {
    const app = createApp(c);
    app.use(async function(ctx) {
      if (await ctx.cashed()) throw new Error('wtf');
      ctx.body = 'lol';
    });

    request(app.listen())
      .post('/')
      .expect(200, t.end);
  }
);

test.cb('when cached when the response is fresh it should 304', t => {
  const app = createApp(c);
  app.use(async function(ctx) {
    if (await ctx.cashed()) return;
    throw new Error('wtf');
  });

  request(app.listen())
    .get('/')
    .set('If-None-Match', '"lol"')
    .expect(304, t.end);
});
