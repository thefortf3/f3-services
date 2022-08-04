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
        connection.query("SELECT ao_id, bddate, DAYOFWEEK(bddate) as weekday, ao, DATEDIFF(NOW(), bddate) as age FROM (SELECT ao_id, MAX(bd_date) as bddate, ao from beatdowns LEFT JOIN aos ON beatdowns.ao_id = aos.channel_id  WHERE ao_id IN (SELECT channel_id FROM aos WHERE backblast = 1) GROUP BY ao_id ORDER BY bd_date) as ao_by_dow", (error, results) => {
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
