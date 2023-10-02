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
