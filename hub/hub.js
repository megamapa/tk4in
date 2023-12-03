/********************************************************/
/* HUB                                                  */
/* Para executar use: node hub.js &                     */
/********************************************************/
process.title = 'hub';
const Version = 'v1.0.0';

const {getDate} = require('../utils/utils.js')
/****************************************************************************************************/
/* Read enviroment variables																		*/
/****************************************************************************************************/
require('dotenv').config({ path: '../.env' });

/****************************************************************************************************/
/* Create and open express connection 																*/
/****************************************************************************************************/
const app = require('express');
const http = require('http').createServer(app);
http.listen(process.env.HUBPort || 50900);

/****************************************************************************************************/
/* Socket.io      																					*/
/****************************************************************************************************/
const io = require('socket.io')(http, {
	cors: {
	  origin: '*',
	}
  });

io.on('connection', (socket) =>{
    socket.on('session', (data)=>{
	    socket.emit('begin_update', '{"name":"'+process.title+'","version":"'+Version+'"}');
    })
	
    socket.on('message', (msg)=>{
        socket.broadcast.emit('message', msg);
    })

});

/****************************************************************************************************/
/* Create and open Redis connection 																*/
/****************************************************************************************************/
const Redis = require('ioredis');
const hub = new Redis({host:process.env.RD_host, port:process.env.RD_port, password:process.env.RD_pass});
const pub = new Redis({host:process.env.RD_host, port:process.env.RD_port, password:process.env.RD_pass});

// Publica STATUS
async function PublishUpdate() {
	getDate().then(dte => {
		let uptime = Date.parse(dte) - starttime;
		pub.publish('san:server_update','{"name":"'+process.title+'","version":"'+Version+'","ipport":"'+process.env.HUBIP+':'+process.env.HUBPort+'","uptime":"'+Math.floor(uptime/60000)+'"}');
	});
}

// Updates server status as soon as it successfully connects
hub.on('connect', function () { PublishUpdate(); getDate().then(dte =>{ console.log('\u001b[36m'+dte+': \u001b[32mHUB connected.\u001b[0;0m');
																		console.log('\u001b[36m'+dte+': \u001b[32mWaiting clients...\u001b[0;0m');}); });

// Subscribe on chanels
hub.subscribe("san:server_update","san:monitor_update", (err, count) => {
  if (err) {
	console.log('\u001b[36m'+dte+': \u001b[31mFailed to subscribe: '+ err.message +'\u001b[0m');
  } 
});

// Waiting messages
hub.on("message", (channel, message) => {
  switch (channel) {
	case 'san:server_update' :
		break;

	case 'san:monitor_update' :
		io.emit("dev_monitor",message);
		break;
	  
  }
	
  
});

/****************************************************************************************************/
/* Create and open MySQL connection																	*/
/****************************************************************************************************/
const mysql = require('mysql');
const db = mysql.createPool({host:process.env.DB_host, database:process.env.DB_name, user:process.env.DB_user, password:process.env.DB_pass, connectionLimit:10});

// Initialize global variables
var starttime=0,numdev=0,msgsin=0,msgsout=0,bytsin=0,bytsout=0,bytserr=0;

// Update statistics ever 60s
setInterval(function() {
			// Get datetime
			let dte = new Date(new Date().getTime()).toISOString().replace(/T/,' ').replace(/\..+/, '');
			// Publish update status
			PublishUpdate();
			// Update database
			db.getConnection(function(err,connection){
				if (!err) {
					connection.query('INSERT INTO syslog (datlog,server,version,ipport,devices,msgsin,msgsout,bytsin,bytsout,bytserr) VALUES (?,?,?,?,?,?,?,?,?,?)',[dte, process.title, Version, process.env.SrvIP + ':' + process.env.SrvPort, numdev, msgsin, msgsout, bytsin, bytsout, bytserr],function (err, result) {connection.release(); if (err) err => console.error(err);});
				}
				msgsin=0;
				msgsout=0;
				bytsin=0;
				bytsout=0;
				bytserr=0;
			});
},60000);

/****************************************************************************************************/
/* 	Show parameters and waiting clients																*/
/****************************************************************************************************/
const OS = require('os');

getDate().then(dte => {
	// Save start datetime
	starttime = Date.parse(dte);
	// Show parameters and waiting clients
	console.log('\u001b[36m'+dte+': \u001b[37m================================');
	console.log('\u001b[36m'+dte+': \u001b[37mAPP : ' + process.title + ' ('+Version+')');
	console.log('\u001b[36m'+dte+': \u001b[37mIP/Port : ' + process.env.HUBIP + ':' + process.env.HUBPort);
	console.log('\u001b[36m'+dte+': \u001b[37mCPUs: '+ OS.cpus().length);
	console.log('\u001b[36m'+dte+': \u001b[37m================================');});