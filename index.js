/****************************************************************************************************/
/* tk4in                                                                                            */
/* Para executar use: node index.js &                                                               */
/****************************************************************************************************/
process.title = 'tk4in';
const Version = '2.0.0';
var starttime,USID;

/****************************************************************************************************/
/* Funcoes uteis   																					*/
/****************************************************************************************************/
async function GetDate() {
	let offset = new Date(new Date().getTime()).getTimezoneOffset();
	return new Date(new Date().getTime() - (offset*60*1000)).toISOString().replace(/T/,' ').replace(/\..+/, '');
}

async function RandomNum(min, max) {  
	return Math.floor( Math.random() * (max - min) + min)
}

// Gera uma Unic Session ID
async function GetUSID() {
	res1 = await RandomNum(111,999);
    res2 = await RandomNum(20199,99199);
	res3 = await RandomNum(10,99);
	res4 = await RandomNum(10,99);
	res5 = await RandomNum(10199,99999);
	return('TK-'+Version+'.'+res1+'.'+res2+'.'+res3+'.'+res4+'.'+res5);
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
const pub = new Redis({host:process.env.RD_host, port:process.env.RD_port, password:process.env.RD_pass});

// Publica STATUS
async function PublishUpdate() {
	GetDate().then(dte => {
		let uptime = Date.parse(dte) - starttime;
		pub.publish('san:server_update','{"name":"'+process.title+'","version":"'+Version+'","ipport":"'+process.env.SrvIP+':'+process.env.SrvPort+'","uptime":"'+Math.floor(uptime/60000)+'"}');
	});
}

// Updates server status as soon as it successfully connects
hub.on('connect', function () { PublishUpdate(); GetDate().then(dte =>{ console.log('\033[36m'+dte+': \033[32mHUB conectado.\033[0;0m');
																		console.log('\033[36m'+dte+': \033[32mAguardando clientes...\033[0;0m');}); });

/****************************************************************************************************/
/* Inicializa o express																		        */
/****************************************************************************************************/
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require("helmet");
const app = express();
const {	randomBytes } = require('node:crypto');
const useragent = require('express-useragent');

// Certificado
const privateKey = fs.readFileSync('/etc/letsencrypt/live/tk4.in/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/tk4.in/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/tk4.in/fullchain.pem', 'utf8');

// Inicia http & https
const httpServer = http.createServer(app);
const httpsServer = https.createServer({
	key: privateKey,
	cert: certificate,
	ca: ca
}, app);

httpServer.listen(80, () => {
	GetDate().then(dte =>{console.log('\033[36m'+dte+': \033[32mHTTP Server rodando na porta 80.\033[0;0m');});
});

httpsServer.listen(443, () => {
	GetDate().then(dte =>{console.log('\033[36m'+dte+': \033[32mHTTPS Server rodando na porta 443.\033[0;0m');});
});


async function GetSession(req, res) {
	// Inicializa a sessao
	let	session = {
		USID : '',
		start: await GetDate(),
		login : '*',
		lang : "en-US",
		map : 'MB',
		mapset : ['MB'],
		useragent : {},
	};
	// le o USID no cookie
	let USID = req.cookies._tk_v;
	// Se nao tiver um cookie cria um novo
	if (USID === undefined) { USID = await GetUSID(); }
	// Verifica se tem uma sessao no redis
	if (await hub.exists('ses:'+USID)) {
		session = await hub.hgetall('ses:'+USID);
	} else {
		session.USID = USID;
		session.useragent = req.useragent;
		await hub.hset('ses:'+USID, session);
	}
	// Retorna a sessao
	console.log(JSON.stringify(session, null, 2));
	return(session);
}

async function MakeIndex(req, res) {
	// Gera noonce
	const nonce = randomBytes(64).toString('base64');
	// Cria os Headers
	app.use(helmet({
		referrerPolicy: {
				policy: "no-referrer-when-downgrade",
		},
		contentSecurityPolicy:{
			directives: {
				"default-src": ["'self'"],
				"base-uri": ["'self'"],
				  "font-src": ["cdnjs.cloudflare.com/ajax/libs/font-awesome/"],
				"connect-src": ["'self'","*.mapbox.com/"],
				"script-src": ["'report-sample'", "'nonce-"+nonce+"'", "cdn.jsdelivr.net/npm/", process.env.CDNBase],
				"style-src": ["'self'", "report-sample'", "cdn.jsdelivr.net/npm/", process.env.CDNBase],
				"object-src": ["'none'"],
				"frame-src": ["'self'"],
				"frame-ancestors": ["'none'"],
				"img-src": ["'self'", process.env.CDNBase],
				"form-action": ["'self'"],
				"media-src": ["'self'"],
				"worker-src": ["'self'"]
			}
		},
		
	  })
	);
	// Pega sessao
	GetSession(req).then(session => {
		// Envia cookie da sessao
		res.cookie('_tk_v', session.USID, { domain: process.env.CKEBase, path: '/', secure: true });
		// 
		

		  

		res.send('Hello there !');
	});
}


app.use(cookieParser());
app.use(useragent.express());
app.get('/', function(req, res){


	MakeIndex(req, res);

	


		
	
});

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