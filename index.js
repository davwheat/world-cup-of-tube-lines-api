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
const fs = require('fs').promises;
const fsSync = require('fs');

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

/**
 * @returns {string[]} Tweet IDs identified by the algorithm to be a poll from Geoff!
 */
async function GetTweetIDs() {
  //   'https://api.twitter.com/2/tweets/search/recent?query=from:geofftech AND #WorldCupOfTubeLines&expansions=attachments.poll_ids',
  const data = await fetch(
    `https://api.twitter.com/2/tweets/search/recent?query=from:geofftech %23WorldCupOfTubeLines -has:mentions -is:retweet -is:quote&max_results=100&expansions=attachments.poll_ids`,
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
      },
    }
  );

  const json = await data.json();
  // console.log(JSON.stringify(await data.json(), null, 2));

  const pollTweets = json.data.filter(tweet => tweet.attachments && tweet.attachments.poll_ids && tweet.attachments.poll_ids[0]);

  const ids = pollTweets.reduce((prev, curr) => [...prev, curr.id], []);

  // Log(JSON.stringify(ids));

  Log(`Identified ${ids.length} possible game tweets!`, Log.SEVERITY.INFO);

  return ids;
}

async function UpdatePollData() {
  const tweetIds = require('./cup.json');

  const realIds = {};

  // filters out 'null' IDs
  for (const key in tweetIds) {
    if (tweetIds.hasOwnProperty(key)) {
      const id = tweetIds[key];
      if (id !== null) realIds[key] = id;
    }
  }

  const extraIds = await GetTweetIDs();

  let counter = 0;
  extraIds.forEach(id => {
    if (Object.values(realIds).includes(id)) return;

    realIds[`unknown${counter}`] = id;
    counter++;
  });

  Log(`${counter} IDs were not known to be correct`, counter > 0 ? Log.SEVERITY.WARNING : Log.SEVERITY.INFO);

  // Log(JSON.stringify(realIds));

  // fetch data from twitter
  const data = await GetDataFromTwitterApi(Object.values(realIds));
  // unix timestamp
  const now = new Date().getTime();

  // Log(JSON.stringify(data));

  /**
   * @type {Array.<{tweetId: string, game: string, poll: {id: string, options: Array.<{position:number,label:string,votes:number}>}}>}
   */
  const allData = [];

  data.tweets.forEach(tweet => {
    const pollId = tweet.attachments.poll_ids[0];
    const poll = data.polls.find(p => p.id === pollId);

    const gameKeys = Object.keys(realIds);
    let thisKey = gameKeys.find(key => realIds[key] === tweet.id);

    const finalData = {
      tweetId: tweet.id,
      game: thisKey,
      poll: { ...poll },
    };

    allData.push(finalData);
  });

  if (!fsSync.existsSync('./data/data.json')) {
    await fs.writeFile('./data/data.json', '{}');
  }

  let historicalData = require('./data/data.json');

  allData.forEach(game => {
    if (game.poll.voting_status === 'closed') return;

    if (!historicalData[game.game]) {
      historicalData[game.game] = {
        game: game.game,
        options: { one: game.poll.options[0].label, two: game.poll.options[1].label },
        results: [],
      };
    }

    historicalData[game.game].results.push({
      timestamp: now,
      votes: {
        one: game.poll.options[0].votes,
        two: game.poll.options[1].votes,
      },
    });
  });

  // update latest copy of data
  historicalData.latest_all = allData;
  // Log(JSON.stringify(historicalData.latest_all));

  // Log(JSON.stringify(historicalData));

  await fs.writeFile('./data/data.json', JSON.stringify(historicalData, null, "\t"));
  await fs.writeFile('./data/data.min.json', JSON.stringify(historicalData));
}

/**
 *
 * @param  {...string} tweetIds
 * @returns {Promise<{tweets:Array.<{attachments:{poll_ids:string[]},id:string,text:string}>,polls:Array.<{id:string,options:Array.<{position:number,label:string,votes:number}>}>}}>}
 */
async function GetDataFromTwitterApi(...tweetIds) {
  const tweet = await (
    await fetch(
      `https://api.twitter.com/2/tweets?ids=${tweetIds.join(
        ','
      )}&expansions=attachments.poll_ids&poll.fields=duration_minutes,end_datetime,id,options,voting_status`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
      }
    )
  ).json();
  Log('Received data from Twitter API', Log.SEVERITY.DEBUG);

  return {
    tweets: tweet.data,
    polls: tweet.includes.polls,
  };
}

app.get(`/getpolls`, async (req, res) => {
  const data = require('./data/data.json');

  return SendResponse.JSON(res, data.latest_all);
});

app.get(`/fullhistory`, async (req, res) => {
  const allData = require('./data/data.json');

  return SendResponse.JSON(res, allData);
});

Log(`Starting API listener...`, Log.SEVERITY.DEBUG);

let listener = app.listen(port || 2678, () => {
  Log(`Listening at localhost:${listener.address().port}`, Log.SEVERITY.INFO);

  UpdatePollData();
  // GetTweetIDs();

  setInterval(() => {
    Log('Fetching latest data from the Twitter API');
    UpdatePollData();
  }, 60000);
});
