/* jslint node: true */
/* jshint esversion: 9 */
"use strict";

const config = require("./config");
const mysql = require("mysql");

const pool = mysql.createPool({
    host: config.pm.host,
    user: config.pm.user,
    password: config.pm.password,
    database: config.pm.name
});
var pm = {};

pm.getBBs = async function (callback) {
    pool.getConnection((err, connection) => {
        if (err) throw err;
        connection.query("SELECT aos.channel_id, aos.ao, aos.site_q_user_id, users.user_name, aos.day_of_week, DATEDIFF(NOW(), last_bd) as age from aos INNER JOIN users ON users.user_id = aos.site_q_user_id INNER JOIN (select ao_id, MAX(bd_date) as last_bd from beatdowns GROUP BY ao_id) as bdinfo on aos.channel_id  = bdinfo.ao_id", (error, results) => {
            connection.release();
            if (error) throw error;
            var normalResults = results.map((mysqlObj, index) => {
                return Object.assign({}, mysqlObj)
            });
            callback(normalResults);
        });
    });
}

pm.getBBDataSince = async function (date, callback) {
    pool.getConnection((err, connection) => {
        if (err) throw err;
        connection.query("SELECT timestamp, ao_id, bd_date, q_user_id, coq_user_id, pax_count, backblast, fngs FROM beatdowns WHERE timestamp > ? ORDER BY timestamp ASC", [date], (error, results) => {
            if (error) {
                connection.release()
                throw error;
            }
            var bdResults = results.map((mysqlObj, index) => {
                return Object.assign({}, mysqlObj)
            });
            connection.query("SELECT user_id, user_name from users", (error2, results2) => {
                if (error2) {
                    connection.release();
                    throw error2;
                }
                let users = {}
                results2.forEach((mysqlObj2, index) => {
                    users[mysqlObj2['user_id']] = mysqlObj2['user_name']
                });
                connection.query("SELECT channel_id, ao from aos", (error3, results3) => {
                    connection.release()
                    if (error3) throw error3;
                    let aos = {}
                    results3.forEach((mysqlObj3, index) => {
                        aos[mysqlObj3['channel_id']] = mysqlObj3['ao']
                    });

                    let backblasts = buildBackblast(bdResults, users, aos);                    
                    callback(backblasts);
                });                
            });            
        });
    });
}

function buildBackblast(beatdowns, users, aos) {
    let beatdownsCleaned = []
    beatdowns.forEach((beatdown) => {
        let beatdownClean = {}

        beatdownClean['q'] = users[beatdown['q_user_id']]
        if (beatdown['coq_user_id'] != null) {            
            beatdownClean['coq'] = users[beatdown['coq_user_id']]
        }
        beatdownClean['ao'] = aos[beatdown['ao_id']]
        beatdownClean['count'] = beatdown['pax_count']

        if (beatdown['fngs'] != "None listed") {
            if (beatdown['fngs'] != "0") {
                beatdownClean['fngs'] = beatdown['fngs'].substring(beatdown['fngs'].indexOf(' ') + 1);
            }
        }
        let spliceIndex = 7
        if (beatdown['backblast'].indexOf("VQ?:") != -1) {
            spliceIndex = 8
        }
        let pax = []
        
        let beatdownStrings = beatdown['backblast'].split('\n')
        
        let header = beatdownStrings.splice(0, spliceIndex)
        beatdownClean['backblast'] = beatdownStrings.join('\n')
        beatdownClean['title'] = beatdown['backblast'].split('\n')[0].substring(11)
        beatdownClean['date'] = beatdown['bd_date']
        beatdownClean['timestamp'] = parseFloat(beatdown['timestamp'])
        let paxString = header[4].substring(5)
        let paxlist = paxString.split(' ')
        for (let thepax of paxlist) {
            let paxid = thepax.replace(/[><@ ]/g, '')
            if (paxid in users) {
                pax.push(users[paxid])                
            }
        }
        beatdownClean['pax'] = pax
        if (header[0].indexOf('Backblast') != -1) {
            beatdownsCleaned.push(beatdownClean)
        }
        
    })
    return beatdownsCleaned
}

pm.addVQ = async function (date, pax, ao, callback) {
    pool.getConnection((err, connection) => {
        if (err) throw err;        
        connection.query("INSERT  INTO vqs (date, name, ao) VALUES (?,?,?)", [date, pax, ao], error => {
            connection.commit();
            connection.release();
            if (error) callback(error)
            else callback()            
        })
            
    });
}

module.exports = pm;
