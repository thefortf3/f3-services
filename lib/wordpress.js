/* jslint node: true */
/* jshint esversion: 9 */
"use strict";

const { toBase64 } = require("request/lib/helpers");
const config = require("./config");
const fetch = require("node-fetch")


let token = config.wordpress.username + ":" + config.wordpress.password
token = toBase64(token)

let headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.95 Safari/537.36',
'Authorization': 'Basic ' + token,
'Content-type': 'application/json'}

let wordpress={}

async function getIdBySearch(type, query) {
    let url = config.wordpress.base_url + type + "?search="
    let response = await fetch(url + encodeURIComponent(query), { method: 'GET', headers: headers })
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    let response_json = await response.json()
    if (response_json.length > 0) {
        for (let result of response_json) {
            if (result['name'].toLowerCase() == query.toLowerCase()) {
                return result['id']
            }
        }
    }
    return null
}


async function getIdFromCreate(type, name) {
    let url = config.wordpress.base_url + type
    let data = {name  : name}
    let response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(data)})
    
    if (!response.ok) {
	    console.log(response)
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    let response_json = await response.json()
    // console.log(response_json)
    if ('id' in response_json) {
        return response_json['id']
    }
    throw new Error("Unable to create " + type + " error was: \n" + response_json);
}

// Normalize the string we search for (AO specific naming convention here)
function normalize(dirty_data) {
    dirty_data = dirty_data.replace("ao-", '')
    dirty_data = dirty_data.replace(/-/g, ' ')
    return dirty_data
}

// Post the data to wordpress.
//  date: Date
//  pax/fngs: Array of names
wordpress.postToWordpress = async function(title, date, qic, coq, ao, paxlist, backblast) {
    ao = normalize(ao)
    let ao_id = await getIdBySearch("categories", ao)
    let qlist = [qic]
    if (coq != null) {
        qlist.push(coq)
    }
    let tags = []

    if (ao_id == null){
        ao_id = await getIdFromCreate('categories', ao)
    }
    // if preblast:
    //     pb_id = getIdBySearch('categories', "Pre-Blast")
    //     if pb_id is None:
    //         raise Exception("Unable to find pre-blast category")
    //     new_ids = []
    //     new_ids.append(pb_id)
    //     new_ids.append(ao_id)
    //     ao_id = new_ids

   
        

    for (let thepax of paxlist) {
        if (thepax.trim() != "") {
            let tag_id = await getIdBySearch("tags", thepax.trim())
            if  (tag_id != null){
                tags.push(tag_id)
            }
            else{
                tags.push(await getIdFromCreate("tags", thepax.trim()))
            }
        }
    }

    for (let theq of qlist) {
        if (theq.trim() != "") {
            let tag_id = await getIdBySearch("tags", theq.trim())
            if  (tag_id != null){
                tags.push(tag_id)
            }
            else{
                tags.push(await getIdFromCreate("tags", theq.trim()))
            }
        }
    }
    let dateString = getFormattedDate(date)
    let nowDateString = getWPFormattedDateTime(new Date(new Date().toLocaleString("en-US", {timeZone: 'America/New_York'})))

    let post = {
        'title'    : title,
        'status'   : 'publish',
        'content'  : backblast,
        'categories': ao_id,
        'date'   : nowDateString,
        'tags' : tags,
        'qic' : qlist.join(", "),
        'workout_date' : dateString
    }
    // print(str(ao_id))
    // print(str(tags))
    // response = requests.get(url + "&status=draft", headers=headers)
    console.log(post)
    
    let url = config.wordpress.base_url + "posts"
    let response = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(post)})

    // response = requests.post(url, headers=headers, json=post)
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json()

}

function getFormattedDate(date) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
}

function getWPFormattedDateTime(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }


module.exports = wordpress;
