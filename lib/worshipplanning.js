/* jslint node: true */
/* jshint esversion: 9 */
"use strict";

const config = require("./config");
const request = require("request");
var wp = {};

const BASEHEADERS = {
  "content-type": "application/json",
  key: `${config.wp.apikey}`,
};

function addToken(headers, token) {
  headers.authorization = token;
  return headers;
}

// TODO: make suck less
function dateHandler(dateStr) {
  var dateArray = dateStr.substring(9, dateStr.length - 1).split(",");
  var dp = dateArray.slice(1).map((part, index) => {
    if (index === 0) part = (parseInt(part) + 1).toString();
    return part.padStart(2, "0");
  });
  var year = dateArray[0];
  var resultStr = `${year}-${dp[0]}-${dp[1]}T${dp[2]}:${dp[3]}:00-0400`;
  var result = new Date(resultStr);
  return result;
}

wp.getEvents = async function (page, callback) {
  // get auth token
  let token = await login().catch((err) => callback(err));

  const httpOpts = {
    url: "",
    headers: addToken(BASEHEADERS, token),
    json: {},
  };

  // pull all events
  let events = await callService({
    ...httpOpts,
    ...{ url: `${config.wp.baseurl}/events?perPage=100&page=${page}` },
  }).catch((err) => callback(err));

  // enrich with assignment data
  let assignments = await Promise.all(
    events.data.map(async (theEvent) => {
      let assignment = await callService({
        ...httpOpts,
        ...{
          url: `${config.wp.baseurl}/eventAssignments/forEvent/${theEvent.id}`,
        },
      }).catch((err) => callback(err));
      return mapEvent(theEvent, assignment);
    })
  );

  callback(
    null,
    assignments.filter((item) => {
      return item.q.length > 0;
    })
  );
};

const login = () => {
  var options = {
    url: `${config.wp.baseurl}/authentication/login`,
    headers: BASEHEADERS,
    json: {
      username: `${config.wp.username}`,
      password: `${config.wp.password}`,
    },
  };
  return callService(options, (body) => body.token);
};

const mapEvent = (theEvent, assignment) => {
  return {
    location: theEvent.location,
    date: dateHandler(theEvent.worshipDate),
    q: assignment
      .filter((q) => {
        /*
      10 = pending
       20 = accepted
       40 = tentatively accepted
      */
        return q.status === 10 || q.status === 20 || q.status === 40;
      })
      .map((q) => {
        return q.user.name.substring(0, q.user.name.indexOf("(")).trim();
      }),
  };
};

const callService = (opts, handler) => {
  return new Promise((resolve, reject) => {
    request(opts, function (err, response, body) {
      if (response.statusCode != 200 || err) {
        let result = err || response.statusMessage;
        reject(result);
      }
      if (handler) resolve(handler(body));
      else resolve(body);
    });
  });
};

module.exports = wp;
