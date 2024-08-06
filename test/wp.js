require('dotenv').config()

const wp = require("../lib/worshipplanning");

wp.getEvents(1, function (err, events) {
    if (err) {
      console.log(err);
      
    } else {
      console.log(JSON.stringify(events, null, 4));
    }
  });