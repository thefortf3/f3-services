require('dotenv').config()
const wordpress = require('../lib/wordpress');
const pm = require('../lib/paxminer');


async function postBBs(backblasts, timestamp) {
  let resultJson = {}
  resultJson['last'] = timestamp
  resultJson['count'] = 0
  try {
    for(let i=0; i < backblasts.length; i++) {
      let bb = backblasts[i]
      console.log(bb)

      retval = await wordpress.postToWordpress(
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



(async() => {
try {
  let timestamp = 1723057105.0
  let resultJson = {}
  resultJson['count'] = 0
  resultJson['last'] = 1723057105.0
  pm.getBBDataSince(timestamp, results => {
	  console.log(results)
      postBBs(results, timestamp).then(resultsJson => {
        // res.header("Content-Type", "application/json");
	console.log(resultsJson);
        // res.send(JSON.stringify(resultsJson, null, 4));
      })
  }).catch(err => {
    console.log(err);
    res.send("Error: " + err);
  })
} catch (error) {
  console.log(error)
}
})();


