require('dotenv').config()
const express = require("express");
const app = express();
const wp = require("./lib/worshipplanning");
const pm = require("./lib/paxminer");
const wordpress = require("./lib/wordpress");
const pb = require("./lib/preblast");
//const slack = require('./lib/slack')

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => res.redirect("/api/heartbeat"));

app.get("/api/heartbeat", (req, res) => res.send("Ok"));

app.get("/api/events/", (req, res) =>
  wp.getEvents(req.query.page || 1, function (err, events) {
    if (err) {
      console.log(err);
      res.send("Error: " + err);
    } else {
      res.header("Content-Type", "application/json");
      res.send(JSON.stringify(events, null, 4));
    }
  })
);

app.get("/api/bbcheck/", (req, res) => 
  pm.getBBs(results => {
    res.header("Content-Type", "application/json");
      res.send(JSON.stringify(results, null, 4));
  }).catch(err => {
    console.log(err);
    res.send("Error: " + err);
  })
);

app.get("/api/postbbs/", (req, res) => {
  let timestamp = parseFloat(req.query['timestamp'])
  let resultJson = {}
  resultJson['count'] = 0
  resultJson['last'] = timestamp
  pm.getBBDataSince(timestamp, results => {
      postBBs(results, timestamp).then(resultsJson => {
        res.header("Content-Type", "application/json");
        res.send(JSON.stringify(resultsJson, null, 4));
      })
  }).catch(err => {
    console.log(err);
    res.send("Error: " + err);
  })

  
});

app.get("/api/postpbs/", (req, res) => {
  let timestamp = parseFloat(req.query['timestamp'])
  let resultJson = {}
  resultJson['count'] = 0
  resultJson['last'] = timestamp;

  pb.searchPreblastPosts(timestamp).then(results => {
      postPBs(results, timestamp).then(resultsJson => {
        res.header("Content-Type", "application/json");
        res.send(JSON.stringify(resultsJson, null, 4));
      })
  }).catch(err => {
      console.log(err);
  });

  pm.getBBDataSince(timestamp, results => {
      postBBs(results, timestamp).then(resultsJson => {
        res.header("Content-Type", "application/json");
        res.send(JSON.stringify(resultsJson, null, 4));
      })
  }).catch(err => {
    console.log(err);
    res.send("Error: " + err);
  })

  
});

app.post("/api/addvq", (req, res) => {
  ao = req.body['ao']
  pax = req.body['pax']
  date = req.body['date']
  pm.addVQ(date, pax, ao, (err) => {
    if (err) {
      console.log(err);
      res.send("Error: " + err);
    } else {
      res.send("Ok")
    }

  })
  
}
);

async function postPBs(preblasts, timestamp) {
  let resultJson = {}
  resultJson['last'] = timestamp
  resultJson['count'] = 0
  try {
      for (let i=0; i < preblasts.length; i++) {
        let r = preblasts[i];
        console.log(r.Preblast);
        retval= wp.postToWordpress(
            r.Preblast, 
            r.Date + " " + r.Time + ":00", 
            r.Q, 
            null,
            r.Where, 
            [], 
            r.Content,
            true)
 
      if (r.Timestamp > resultJson['last']) {
        resultJson['last'] = r.Timestamp;
      }
      resultJson['count']++;
    }
  } catch (error) {
    console.log(error)
    
  }
  return resultJson
}

async function postBBs(backblasts, timestamp) {
  let resultJson = {}
  resultJson['last'] = timestamp
  resultJson['count'] = 0
  try {
    for(let i=0; i < backblasts.length; i++) {
      let bb = backblasts[i]
      console.log(bb)

      retval = wordpress.postToWordpress(
          bb.title, 
          bb.date, 
          bb.q, 
          ('coq' in bb) ? bb.coq : null, 
          bb.ao, 
          bb.pax, 
          bb.backblast)
      if (bb.timestamp > resultJson['last']) {
        resultJson['last'] = bb.timestamp
      }
      resultJson['count']++;
    }
  } catch (error) {
    console.log(error)
    
  }
  return resultJson
}

app.listen(PORT, () => console.log(`Example app listening on ${PORT}!`));
