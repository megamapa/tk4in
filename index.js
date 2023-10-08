/****************************************************************************************************/
/* tk4in                                                                                            */
/* Para executar use: node index.js &                                                               */
/****************************************************************************************************/
process.title = 'tk4in';
const Version = 'v1.0.0';

/****************************************************************************************************/
/* Funcoes uteis   																					*/
/****************************************************************************************************/
async function GetDate() {
	let offset = new Date(new Date().getTime()).getTimezoneOffset();
	return new Date(new Date().getTime() - (offset*60*1000)).toISOString().replace(/T/,' ').replace(/\..+/, '');
}

/****************************************************************************************************/
/* Le as variáveis de ambiente																		*/
/****************************************************************************************************/
const dotenv = require('dotenv');
dotenv.config();

/****************************************************************************************************/
/* Create and open Redis connection 																*/
/****************************************************************************************************/
const Redis = require('ioredis');
const hub = new Redis({host:process.env.RD_host, port:process.env.RD_port, password:process.env.RD_pass});

// Publica STATUSD
async function PublishUpdate() {
	GetDate().then(dte => {
		let uptime = Date.parse(dte) - starttime;
		pub.publish('san:server_update','{"name":"'+process.title+'","version":"'+Version+'","ipport":"'+process.env.SrvIP+':'+process.env.SrvPort+'","uptime":"'+Math.floor(uptime/60000)+'"}');
	});
}

// Updates server status as soon as it successfully connects
hub.on('connect', function () { PublishUpdate(); GetDate().then(dte =>{ console.log('\033[36m'+dte+': \033[32mHUB connected.\033[0;0m');
																		console.log('\033[36m'+dte+': \033[32mWaiting clients...\033[0;0m');}); });

/****************************************************************************************************/
/* Inicializa o express																		        */
/****************************************************************************************************/
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const app = express();

// Certificate
const privateKey = fs.readFileSync('/etc/letsencrypt/live/tk4.in/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/tk4.in/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/tk4.in/fullchain.pem', 'utf8');

const credentials = {
	key: privateKey,
	cert: certificate,
	ca: ca
};

app.use((req, res) => {
	res.send('Hello there !');
});

// Starting both http & https servers
const httpServer = http.createServer(app);
const httpsServer = https.createServer(credentials, app);

httpServer.listen(80, () => {
	GetDate().then(dte =>{console.log('\033[36m'+dte+': \033[32mHTTP Server rodando na porta 80.\033[0;0m');});
});

httpsServer.listen(443, () => {
	GetDate().then(dte =>{console.log('\033[36m'+dte+': \033[32mHTTPS Server rodando na porta 443.\033[0;0m');});
});

// Inicializa variáveis globais
var starttime=0;

/****************************************************************************************************/
/* 	Mostra parametros e aguarda clientes															*/
/****************************************************************************************************/
const OS = require('os');
GetDate().then(dte => {
	// Salva hora de inicio
	starttime = Date.parse(dte);
	// Mostra parametros e aguarda clientes
	console.log('\033[36m'+dte+': \033[37m================================');
	console.log('\033[36m'+dte+': \033[37mAPP : ' + process.title + ' ('+Version+')');
	console.log('\033[36m'+dte+': \033[37mCPUs: '+ OS.cpus().length);
	console.log('\033[36m'+dte+': \033[37m================================');});