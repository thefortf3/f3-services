require('dotenv').config()
const pm = require("../lib/paxminer");


pm.getBBs((results) => {
    results.forEach(result => {
        console.log("AO " + result.ao + " last posted a BB " + result.age + " days ago");
    });
    console.log(results);

    process.exit();
});

pm.addVQ('2023-02-11', 'Console', 'The Ranch')
    