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
        connection.query("SELECT ao_info.channel_id, aos.ao, ao_info.siteq_id, users.user_name, ao_info.day_of_week, DATEDIFF(NOW(), MAX(bddate)) as age from ao_info INNER JOIN aos on aos.channel_id  = ao_info.channel_id INNER JOIN users ON users.user_id = ao_info.siteq_id INNER JOIN beatdowns on ao_info.channel_id  = beatdowns.ao_id", (error, results) => {
            connection.release();
            if (error) throw error;
            var normalResults = results.map((mysqlObj, index) => {
                return Object.assign({}, mysqlObj)
            });
            callback(normalResults);
        });
    });
}

module.exports = pm;
