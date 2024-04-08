require('dotenv').config()
const wordpress = require('../lib/wordpress');
const pm = require("../lib/paxminer");


// pm.getBBs((results) => {
//     results.forEach(result => {
//         console.log("AO " + result.ao + " last posted a BB " + result.age + " days ago");
//     });
//     console.log(results);

//     process.exit();
// });

// pm.addVQ('2023-02-11', 'Console', 'The Ranch', (err) => {
//     console.error("ERROR")
//     process.exit()
// });
    
pm.getBBDataSince(1711940711, (results) => {
    //console.log(results)
    resultJson = {}
    resultJson['count'] = 0
    resultJson['last']
    for (let bb of results) {
        console.log(bb)
        wordpress.postToWordpress(
            bb.title, 
            bb.date, 
            bb.q, 
            ('coq' in bb) ? bb.coq : null, 
            bb.ao, 
            bb.pax, 
            bb.backblast).then(resultJson => {
                console.log(resultJson)
            })
        //promise.await()
    }
})