/****************************************************************************************************/
/* http2                                                                                            */
/* Para executar use: node http2.js &                                                               */
/****************************************************************************************************/
process.title = 'http2';
const Version = '2.0.0';

var starttime;

/****************************************************************************************************/
/* Funções úteis   																					*/
/****************************************************************************************************/
async function GetDate() {
	let offset = new Date(new Date().getTime()).getTimezoneOffset();
	return new Date(new Date().getTime() - (offset*60*1000)).toISOString().replace(/T/,' ').replace(/\..+/, '');
}

const {	randomBytes } = require('node:crypto');
async function RandomNum(min, max) {  
	return Math.floor( Math.random() * (max - min) + min)
}

// Gera uma USID - Unique Session ID
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
/* Cria e abre as conexões com o Redis 																*/
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

// Atualiza o STATUS do servidor assim que o redis conectar
hub.on('connect', function () { PublishUpdate(); GetDate().then(dte =>{ console.log('\033[36m'+dte+': \033[32mHUB conectado.\033[0;0m');
																		console.log('\033[36m'+dte+': \033[32mAguardando clientes...\033[0;0m');}); });

/****************************************************************************************************/
/* Cria e abre uma conexão MySQL																	*/
/****************************************************************************************************/
const mysql = require('mysql');
const db = mysql.createPool({host:process.env.DB_host, database:process.env.DB_name, user:process.env.DB_user, password:process.env.DB_pass, connectionLimit:10});

// Atualiza estatísticas a cada 60s
setInterval(function() {
			// Publica estatus do serviço
			PublishUpdate();
},60000);

/****************************************************************************************************/
/* Inicializa o http2																		        */
/****************************************************************************************************/
const fs = require('node:fs');
// Le o certificado
const privateKey = fs.readFileSync('/etc/letsencrypt/live/tk4.in/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/tk4.in/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/tk4.in/fullchain.pem', 'utf8');
// Cria o servidor
const http2 = require('node:http2');
const server = http2.createSecureServer({
  key: privateKey,
  cert: certificate,
  ca: ca
});

server.listen(443, () => {
	GetDate().then(dte =>{console.log('\033[36m'+dte+': \033[32mHTTPS Server rodando na porta 443.\033[0;0m');});
});

/****************************************************************************************************/
/* Rotinas do http2																			        */
/****************************************************************************************************/
async function GetSession(headers) {
	// Inicializa a sessao
	let	session = {
		startTime: await GetDate(),
		remoteAddress: {IPv4: '', IPv6: ''},
		login : '*',
		lang : "en-US",
		map : 'MB',
		mapset : ['MB'],
	};
	// Le os cookies
	let str = headers['cookie'];
	
	const lang = headers['accept-language'];
	
	
	// le o USID no cookie

	// Se nao tiver um cookie cria um novo
	if (session.cookies === undefined) { USID = await GetUSID(); } else {USID = session.cookies._tk_v}
	// Verifica se tem uma sessao no redis
	if (await hub.exists('ses:'+USID)) {
		session = await hub.hgetall('ses:'+USID);
		await hub.del('ses:'+USID);
		USID = await GetUSID();
	} else {
		session.useragent = headers['user-agent'];
		//session.ipAddress = req.socket.remoteAddress;
	}
	session.USID = USID;
	await hub.hset('ses:'+USID, session);
	// Retorna uma nova sessão
							console.log(JSON.stringify(session, null, 2));
	return(session);
}
/****************************************************************************************************/
/* Mensagens do http2																		        */
/****************************************************************************************************/
server.on('error', (err) => console.log('\033[36m'+dte+': \033[32mErro no HTTP2.\033[0;0m'));

server.on('stream', (stream, headers) => {
	console.log({ headers });
	// Carrega a sessão
	const session = GetSession(headers);
	
	const method = headers[':method'];

	const path = headers[':path'];
	switch(path) {
    	case '/': {
			nonce = randomBytes(16).toString('hex');
			// Envia o Header
			stream.respond({
				':status': '200',
				'access-control-allow-origin': "'"+process.env.WWWBase+"'",
				'content-type': 'text/html; charset=UTF-8',
				'cache-control': 'no-cache',
				'content-security-policy': "default-src 'self'; base-uri 'self'; script-src 'report-sample' 'nonce-"+nonce+"' cdn.jsdelivr.net/npm/ "+process.env.CDNBase+"; style-src 'self' 'report-sample' cdn.jsdelivr.net/npm/ "+process.env.CDNBase+"; object-src 'none'; frame-src 'self'; frame-ancestors 'none'; img-src 'self' "+process.env.CDNBase+"; font-src cdnjs.cloudflare.com/ajax/libs/font-awesome/; connect-src 'self' *.mapbox.com/; form-action 'self'; media-src 'self'; worker-src 'self'",
				'permissions-policy': "geolocation=(self '"+process.env.CDNBase+"')",
				'referrer-policy': "no-referrer-when-downgrade",
				'set-cookie': '_tk_v='+session.USID+'; Domain='+process.env.CKEBase+'; Path=/; Secure; HttpOnly', [http2.sensitiveHeaders]: ['cookie'],
				'set-cookie': 'cross-site-cookie=name; SameSite=None; Secure; HttpOnly',
				'strict-transport-security':'max-age=31536000; includeSubDomains; preload',
				'vary': 'Accept-Encoding',
				'x-content-type-options': 'nosniff',
				'x-frame-options': 'DENY',
				'x-permitted-cross-domain-policies': 'none',
				'x-xss-protection': '1; mode=block',
			}); 
			stream.write("<!DOCTYPE html><html itemscope itemtype='http://schema.org/WebSite'; lang="+session.lang+"><head><meta name='viewport' content='width=device-width, initial-scale=1'><meta charset=utf-8><title itemprop=name>"+process.env.IndexTit+"</title><link rel=dns-prefetch href="+process.env.CDNBase+"><link rel=canonical href="+process.env.WWWBase+" itemprop=url><link rel=icon href='"+process.env.CDNBase+"img/logo.png' itemprop=image><link rel=preload href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/webfonts/fa-regular-400.woff2' as=font type='font/woff2' crossorigin=anonymous><link rel=preload href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/webfonts/fa-solid-900.woff2' as=font type='font/woff2' crossorigin=anonymous><meta name=description content='"+process.env.IndexDes+"' itemprop=description><meta name=keywords content='"+process.env.IndexKey+"'><meta name=apple-mobile-web-app-capable content=yes><meta name=apple-mobile-web-app-status-bar-style content=black-translucent><link href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css' rel=stylesheet integrity='sha384-4bw+/aepP/YC94hEpVNVgiZdgIC5+VKNBQNGCHeKRQN+PtmoHDEXuppvnDJzQIu9' crossorigin=anonymous><link rel=stylesheet href='"+process.env.CDNBase+"css/style.css' integrity='sha384-cVCCdKiMMG+okvKtpSjnqFgt5hMESsz8YyVX4vP/EsduAqJmU2M/ZEtcAXP91uUm' crossorigin=anonymous></head><body>");
			stream.write("teste");
			stream.end("</body><script async src='https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/js/bootstrap.bundle.min.js' integrity='sha384-HwwvtgBNo3bZJJLYd8oVXjrBZt8cqVSpeBNS5n7C8IVInixGAoxmnlMuBnhbgrkm' crossorigin=anonymous></script></body></html>");
			break;
		}

		case '/main': {

			break;
		}

		case '/login': {

			break;
		}

    	case '/favicon.ico': {
			stream.respond({
				':status': '200',
				'content-type': 'image/x-icon',
			});
			res.end();
		}

		default: {
			stream.respond({
				':status': '404',
				'content-type': 'text/html; charset=UTF-8',
			});
			stream.end();
		}
	}


});

/****************************************************************************************************/
/* 	Mostra parâmetros e aguarda clientes															*/
/****************************************************************************************************/
const os = require('node:os');
GetDate().then(dte => {
	// Salva hora de início
	starttime = Date.parse(dte);
	// Mostra parâmetros
	console.log('\033[36m'+dte+': \033[37m================================');
	console.log('\033[36m'+dte+': \033[37mAPP : ' + process.title + ' ('+Version+')');
	console.log('\033[36m'+dte+': \033[37mCPUs: '+ os.cpus().length);
	console.log('\033[36m'+dte+': \033[37m================================');});