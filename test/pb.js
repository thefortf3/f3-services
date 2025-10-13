require('dotenv').config()

const pb = require("../lib/preblast");
const wp = require("../lib/wordpress");

pb.searchPreblastPosts("1760311528").then(results => {
    // console.log(JSON.stringify(results, null, 4));
    for (let r of results) {
        console.log(r.Preblast);
        wp.postToWordpress(
            r.Preblast, 
            r.Date + " " + r.Time + ":00", 
            r.Q, 
            null,
            r.Where, 
            [], 
            r.Content,
            true).then(retval => {
                console.log(retval);
            }).catch(err => {
                console.log(err);
            });

    }
}).catch(err => {
    console.log(err);
});