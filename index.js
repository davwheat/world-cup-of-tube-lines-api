require('dotenv').config();
const env = process.env;
const fetch = require('node-fetch');
const express = require('express');
const app = express();
const port = env.PORT;
const shrinkRay = require('shrink-ray-current');
const Log = require('./logger');
const TOKEN = process.env.TWITTER_BEARER_TOKEN;
const SendResponse = require('./helpers/SendResponse');

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Max-Age', 86400);
  res.header('Cache-Control', `public, max-age=60, stale-if-error=600, stale-while-revalidate=120`);
  next();
});

// Add ETag caching
app.set('etag', 'weak');
app.use(
  express.urlencoded({
    extended: true,
  })
);

// Add gzip/brotli compression
app.use(shrinkRay({ zlib: { level: 7 }, brotli: { quality: 5 } }));

app.get(`/getpoll/:id`, async (req, res) => {
  const id = req.params.id;
  Log('Received request for poll data', Log.SEVERITY.DEBUG);

  if (typeof id === 'undefined') return SendResponse.JSON(res, { error: 'invalid' });

  if (isNaN(parseInt(id))) return SendResponse.JSON(res, { error: 'invalid' });

  const tweet = await (
    await fetch(`https://api.twitter.com/2/tweets?ids=${id}&expansions=attachments.poll_ids`, { headers: { Authorization: `Bearer ${TOKEN}` } })
  ).json();
  Log('Received data from Twitter API', Log.SEVERITY.DEBUG);

  return SendResponse.JSON(res, {
    tweets: tweet.data,
    polls: tweet.includes.polls,
  });
});

Log(`Starting API listener...`, Log.SEVERITY.DEBUG);

let listener = app.listen(port || 2678, () => {
  Log(`Listening at localhost:${listener.address().port}`, Log.SEVERITY.INFO);
});
