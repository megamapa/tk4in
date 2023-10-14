/****************************************************************************************************/
/* http2                                                                                            */
/* Para executar use: node http2.js &                                                               */
/****************************************************************************************************/
process.title = 'http2';
const Version = '2.0.0';

var starttime;

/****************************************************************************************************/
/* Funções úteis																					*/
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
/* Inicializa o http2																				*/
/****************************************************************************************************/
// Le o certificado
const fs = require('node:fs');
const privateKey = fs.readFileSync('/etc/letsencrypt/live/tk4.in/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/tk4.in/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/tk4.in/fullchain.pem', 'utf8');

// Cria o servidor
const http2 = require('node:http2');
const server = http2.createSecureServer({
	key: privateKey,
	cert: certificate,
	ca: ca,
	allowHTTP1 : true
}, onRequest);

server.listen(443, () => {
	GetDate().then(dte =>{console.log('\033[36m'+dte+': \033[32mHTTPS Server rodando na porta 443.\033[0m');});
});

server.on('error', (err) => GetDate().then(dte =>{console.log('\033[36m'+dte+': \033[0;31mErro no HTTP2.\033[0m');}));

/****************************************************************************************************/
/* Rotinas do http2																					*/
/****************************************************************************************************/
async function GetSession(headers) {
	// Inicializa a sessao
	let	session = {
		startTime: await GetDate(),
		cookies :{},
		remoteAddress: {IPv4: '', IPv6: ''},
		login : '*',
		map : 'MB',
		mapset : ['MB'],
		lang : 'en-US',
	};
	// Le os cookies
	let str = headers['cookie'];

	//const lang = headers['accept-language'];

	// Se nao tiver um cookie cria um novo
	if (session.cookies.tk_v === undefined) { USID = await GetUSID(); } else {USID = session.cookies.tk_v}
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
	// console.log(JSON.stringify(session, null, 2));
	return(session);
}
/****************************************************************************************************/
/* Mensagens do http2																				*/
/****************************************************************************************************/
function onRequest(req, res) {
	// Verifica se a conexão e HTTP/1 ou HTTP/2
	const { socket: { alpnProtocol } } = req.httpVersion === '2.0' ? req.stream.session : req;
	// Responde
	console.log(req);
	const path = "/";
	switch(path) {
			case '/': {
				nonce = randomBytes(16).toString('hex');
				let USID="fdsfsdfsdfsdf";
				let lang="pt-BR";
				res.writeHead(200, { 
					'access-control-allow-methods': 'GET,POST',
					'access-control-allow-origin': "'"+process.env.WWWBase+"'",
					'cache-control': 'no-cache',
					//'content-encoding': 'gzip',
					'content-security-policy': "default-src 'self'; base-uri 'self'; script-src 'report-sample' 'nonce-"+nonce+"' cdn.jsdelivr.net/npm/ "+process.env.CDNBase+"; style-src 'self' 'report-sample' cdn.jsdelivr.net/npm/ "+process.env.CDNBase+"; object-src 'none'; frame-src 'self'; frame-ancestors 'none'; img-src 'self' "+process.env.CDNBase+"; font-src cdnjs.cloudflare.com/ajax/libs/font-awesome/; connect-src 'self' *.mapbox.com/; form-action 'self'; media-src 'self'; worker-src 'self'",
					'content-type': 'text/html; charset=UTF-8',
					'date': new Date().toUTCString(),
					'permissions-policy': 'geolocation=(self "'+process.env.WWWBase+'")',
					'referrer-policy': "no-referrer-when-downgrade",
					'set-cookie': 'tk_v='+USID+'; Domain='+process.env.CKEBase+'; Path=/; Secure; HttpOnly', [http2.sensitiveHeaders]: ['set-cookie'],
					'set-cookie': 'cross-site-cookie=name; SameSite=None; Secure; HttpOnly',
					'strict-transport-security':'max-age=31536000; includeSubDomains; preload',
					'vary': 'Accept-Encoding',
					'x-content-type-options': 'nosniff',
					'x-frame-options': 'DENY',
					'x-permitted-cross-domain-policies': 'none',
					'x-xss-protection': '1; mode=block' });
				// Header
				res.write("<!DOCTYPE html><html itemscope itemtype='http://schema.org/WebSite'; lang="+lang+"><head><meta name='viewport' content='width=device-width, initial-scale=1'><meta charset=utf-8><title itemprop=name>"+process.env.IndexTit+"</title><link rel=dns-prefetch href="+process.env.CDNBase+"><link rel=canonical href="+process.env.WWWBase+" itemprop=url><link rel=icon href='"+process.env.CDNBase+"img/logo.png' itemprop=image><link rel=preload href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/webfonts/fa-regular-400.woff2' as=font type='font/woff2' crossorigin=anonymous><link rel=preload href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/webfonts/fa-solid-900.woff2' as=font type='font/woff2' crossorigin=anonymous><meta name=description content='"+process.env.IndexDes+"' itemprop=description><meta name=keywords content='"+process.env.IndexKey+"'><meta name=apple-mobile-web-app-capable content=yes><meta name=apple-mobile-web-app-status-bar-style content=black-translucent><link href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css' rel=stylesheet integrity='sha384-4bw+/aepP/YC94hEpVNVgiZdgIC5+VKNBQNGCHeKRQN+PtmoHDEXuppvnDJzQIu9' crossorigin=anonymous><link href='"+process.env.CDNBase+"css/style.css' rel=stylesheet crossorigin=anonymous></head><body>");
				// Block
				res.write("<div class=loader-wrap id=loader-wrap><div class=blocks><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div></div></div>");
				// Scripts
				res.write("</body><script async src='https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/js/bootstrap.bundle.min.js' integrity='sha384-HwwvtgBNo3bZJJLYd8oVXjrBZt8cqVSpeBNS5n7C8IVInixGAoxmnlMuBnhbgrkm' crossorigin=anonymous></script><script nonce="+nonce+">const es=document.getElementsByName('flip');Array.from(es).forEach(function (e){e.addEventListener('click', function(){document.getElementById('login-box').classList.toggle('flipped');});});document.getElementById('log').addEventListener('click', function(){document.getElementById('content').classList.add('blured');document.getElementById('loader-wrap').style.display='block';});");

				res.end("</script></body></html>");
				break;
			}
			
			case '/main': {

				break;
			}

			case '/login': {

				break;
			}
	}		

}


/*server.on('stream', (stream, headers) => {


	console.log(headers);


	// Carrega a sessão
	GetSession(headers).then(session => {

		const method = headers[':method'];

		const path = headers[':path'];
		switch(path) {
			case '/': {
				nonce = randomBytes(16).toString('hex');
				//console.log(session);
				// Envia o Header
				stream.respond({ //http2stream.respond https://http.dev/2/test
					':status': '200',
					'access-control-allow-methods': 'GET,POST',
					'access-control-allow-origin': "'"+process.env.WWWBase+"'",
					'cache-control': 'no-cache',
					//'content-encoding': 'gzip',
					'content-security-policy': "default-src 'self'; base-uri 'self'; script-src 'report-sample' 'nonce-"+nonce+"' cdn.jsdelivr.net/npm/ "+process.env.CDNBase+"; style-src 'self' 'report-sample' cdn.jsdelivr.net/npm/ "+process.env.CDNBase+"; object-src 'none'; frame-src 'self'; frame-ancestors 'none'; img-src 'self' "+process.env.CDNBase+"; font-src cdnjs.cloudflare.com/ajax/libs/font-awesome/; connect-src 'self' *.mapbox.com/; form-action 'self'; media-src 'self'; worker-src 'self'",
					'content-type': 'text/html; charset=UTF-8',
					'date': new Date().toUTCString(),
					'permissions-policy': 'geolocation=(self "'+process.env.WWWBase+'")',
					'referrer-policy': "no-referrer-when-downgrade",
					'set-cookie': 'tk_v='+session.USID+'; Domain='+process.env.CKEBase+'; Path=/; Secure; HttpOnly', [http2.sensitiveHeaders]: ['set-cookie'],
					'set-cookie': 'cross-site-cookie=name; SameSite=None; Secure; HttpOnly',
					'strict-transport-security':'max-age=31536000; includeSubDomains; preload',
					'vary': 'Accept-Encoding',
					'x-content-type-options': 'nosniff',
					'x-frame-options': 'DENY',
					'x-permitted-cross-domain-policies': 'none',
					'x-xss-protection': '1; mode=block',
				},{ endStream : false}); 
				// Header
				stream.write("<!DOCTYPE html><html itemscope itemtype='http://schema.org/WebSite'; lang="+session.lang+"><head><meta name='viewport' content='width=device-width, initial-scale=1'><meta charset=utf-8><title itemprop=name>"+process.env.IndexTit+"</title><link rel=dns-prefetch href="+process.env.CDNBase+"><link rel=canonical href="+process.env.WWWBase+" itemprop=url><link rel=icon href='"+process.env.CDNBase+"img/logo.png' itemprop=image><link rel=preload href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/webfonts/fa-regular-400.woff2' as=font type='font/woff2' crossorigin=anonymous><link rel=preload href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/webfonts/fa-solid-900.woff2' as=font type='font/woff2' crossorigin=anonymous><meta name=description content='"+process.env.IndexDes+"' itemprop=description><meta name=keywords content='"+process.env.IndexKey+"'><meta name=apple-mobile-web-app-capable content=yes><meta name=apple-mobile-web-app-status-bar-style content=black-translucent><link href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css' rel=stylesheet integrity='sha384-4bw+/aepP/YC94hEpVNVgiZdgIC5+VKNBQNGCHeKRQN+PtmoHDEXuppvnDJzQIu9' crossorigin=anonymous><link href='"+process.env.CDNBase+"css/style.css' rel=stylesheet crossorigin=anonymous></head><body>");
				// Block
				stream.write("<div class=loader-wrap id=loader-wrap><div class=blocks><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div></div></div>");
				// Scripts
				stream.write("</body><script async src='https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/js/bootstrap.bundle.min.js' integrity='sha384-HwwvtgBNo3bZJJLYd8oVXjrBZt8cqVSpeBNS5n7C8IVInixGAoxmnlMuBnhbgrkm' crossorigin=anonymous></script><script nonce="+nonce+">const es=document.getElementsByName('flip');Array.from(es).forEach(function (e){e.addEventListener('click', function(){document.getElementById('login-box').classList.toggle('flipped');});});document.getElementById('log').addEventListener('click', function(){document.getElementById('content').classList.add('blured');document.getElementById('loader-wrap').style.display='block';});");

				stream.end("</script></body></html>");
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
				stream.end();
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
});*/

/****************************************************************************************************/
/* Mostra parâmetros e aguarda clientes																*/
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