require('dotenv').config()
const express = require("express");
const app = express();
const wp = require("./lib/worshipplanning");
const pm = require("./lib/paxminer");
//const slack = require('./lib/slack')

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => res.redirect("/api/events"));

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

app.post("/api/addvq", (req, res) => {
  ao = req.body['ao']
  pax = req.body['pax']
  date = req.body['date']
  pm.addVQ(date, pax, ao).catch(err => {
    console.log(err);
    res.send("Error: " + err);
  })
  res.send("Ok")
}
);

app.listen(PORT, () => console.log(`Example app listening on ${PORT}!`));
