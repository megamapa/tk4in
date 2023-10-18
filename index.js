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

server.on('error', (err) => GetDate().then(dte =>{console.log('\033[36m'+dte+': \033[0;31mErro no HTTP2.('+err+'\033[0m');}));

/****************************************************************************************************/
/* Rotinas do http2																					*/
/****************************************************************************************************/
async function Parse(myArray) {
	var obj = {};
	myArray.forEach((elements) =>{
		// Separa key de value
		const element = elements.split("=");
		if (undefined !== element[0] || undefined !==  element[1]) {
			// Verifica se ja existe
			const key = element[0].trim();
			if (undefined === obj[key]) {
				obj[key]=element[1];
			}
		}
	});
	return obj;
}

async function GetSession(req) {





	// Inicializa a sessao
	let	session = {
		cookies : {},
		gets : {},
		remoteAddress: {},
		err : 0,
		name : "",
	};

	// Pega os cookies
	if (typeof req.headers['cookie'] === 'string') {
		const myCookies = req.headers['cookie'].split(";");
		session.cookies = await Parse(myCookies);
	}

	// Se nao tiver um cookie de sessao cria um novo
	if (undefined === session.cookies['tk_v']) { USID = await GetUSID(); } else {USID = session.cookies['tk_v']}
	// Verifica se tem uma sessao no HUB
	if (await hub.exists('ses:'+USID)) {
		// Le os dados da sessao no HUB
		session = await hub.hgetall('ses:'+USID);
		// Deleta a sessao no HUB
		hub.del('ses:'+USID);
		// Cria um novo ID
		USID = await GetUSID();
	}
	
	// Pega o useragent
	session.useragent = req.httpVersion === '2.0'?req.headers['user-agent']:req['user-agent'];

	// Pega os parâmetos se houver
	let url = req.httpVersion === '2.0'?req.headers[':path']:req.url;
	let path = url.split("?");
	if (typeof path[1] === 'string') {
		const myGets = path[1].split("&");
		session.gets = await Parse(myGets);
	}
	// Pega o caminho
	session.path=path[0];

	// Seta a linguagem
	if (undefined !== session.gets['lang']) {
		session.lang = session.gets['lang'];
	} else {
		if (undefined === session.lang) {
			if (typeof req.headers['accept-language'] === 'string') {
				let mylang = req.headers['accept-language'].split(",");
				session.lang = mylang[0];
			}
		}
	}
	// Verifica se a linguagem e uma da válidas se nao for seta com inglês
	langs =['pt-BR','en-US','zh-CN'];
	if ( !langs.includes(session.lang) ) {session.lang='en-US'}

	// Pega o IP
	if (undefined !== req.socket.remoteAddress) {
		let str = req.socket.remoteAddress;
		let pos = str.lastIndexOf(':');
		session.remoteAddress['IPv4']=str.substring(pos+1);
		session.remoteAddress['IPv6']=str.substring(0,pos+1);
	}

	// Guarda novo ID
	session.USID = USID;
	// Guarda último acesso
	session.lastTime = await GetDate();
	// Grava a nova sessao no HUB
	hub.hset('ses:'+USID, session);
	// Retorna uma nova sessão
	//console.log(JSON.stringify(session, null, 2));
	return(session);
}

async function logout(session,res) {
	if (undefined !== session.login) {
		pub.publish('usr:'+session.login,'{"logout":"'+session.USID+'"}');
	}
	// Deleta a sessao no HUB
	hub.del('ses:'+session.USID);
	// Volta para pagina principal
	res.writeHead(301, { 
		'content-type': 'text/html; charset=UTF-8',
		'Location': process.env.WWWBase
	});
	res.end();
}
/****************************************************************************************************/
/* Mensagens do http2																				*/
/****************************************************************************************************/
function onRequest(req, res) {
	// Verifica se a conexão e HTTP/1 ou HTTP/2 e unifica o socket
	const { socket: { alpnProtocol } } = req.httpVersion === '2.0'?req.stream.session:req;
	// Carrega a sessão
	GetSession(req).then(session => {
		// Responde
		switch(session.path) {
			case '/': {
				nonce = randomBytes(16).toString('hex');
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
					'set-cookie': 'tk_v='+session.USID+'; Domain='+process.env.CKEBase+'; Path=/; Secure; HttpOnly',
					'strict-transport-security':'max-age=31536000; includeSubDomains; preload',
					'vary': 'Accept-Encoding',
					'x-content-type-options': 'nosniff',
					'x-frame-options': 'DENY',
					'x-permitted-cross-domain-policies': 'none',
					'x-xss-protection': '1; mode=block' });
				// Le a linguagem
				let lang = require('./lang/'+session.lang+'/index');
				// Header
				res.write("<!DOCTYPE html><html itemscope itemtype='http://schema.org/WebSite'; lang="+session.lang+"><head><meta name='viewport' content='width=device-width, initial-scale=1'><meta charset=utf-8><title itemprop=name>"+lang._TITLE+"</title><link rel=dns-prefetch href="+process.env.CDNBase+"><link rel=canonical href="+process.env.WWWBase+" itemprop=url><link rel=icon href='"+process.env.CDNBase+"img/logo.png' itemprop=image><link rel=preload href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/webfonts/fa-regular-400.woff2' as=font type='font/woff2' crossorigin=anonymous><link rel=preload href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.2/webfonts/fa-solid-900.woff2' as=font type='font/woff2' crossorigin=anonymous><meta name=description content='"+lang._DESCRIPTION+"' itemprop=description><meta name=keywords content='"+lang._KEYWORDS+"'><meta name=apple-mobile-web-app-capable content=yes><meta name=apple-mobile-web-app-status-bar-style content=black-translucent><link href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css' rel=stylesheet integrity='sha384-4bw+/aepP/YC94hEpVNVgiZdgIC5+VKNBQNGCHeKRQN+PtmoHDEXuppvnDJzQIu9' crossorigin=anonymous><link href='"+process.env.CDNBase+"css/style.css' rel=stylesheet crossorigin=anonymous></head><body>");
				// Block
				res.write("<div class=loader-wrap id=loader-wrap><div class=blocks><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div><div class=block></div></div></div>");
				// Body
				res.write("<section id=content class=login-content><div id=login-box class='login-box"+(session.err === 4 ? " flipped":"")+"'><form class=login-form action=login method=post name=logform'><h3 class=login-head><i class='fa fa-fw fa-lg fa-user'></i>"+lang._LOGIN+"</h3><div class=qr-form id=qrid><div class=form-group><label for=login>"+lang._NAME+"</label><input class=form-control name=login id=login value='"+session.name+"'");

				if (0 !== session.err) {
					res.write(" data-bs-toggle='popover' data-bs-placement='top' data-bs-trigger='manual' data-bs-title='");
					switch(session.err) {
						case 1 : { res.write(lang._LOGERR); break}
						case 2 : { res.write(lang._EMAILAUT); break}
						case 4 : { res.write(lang._EMAILERR); break}
						case 8 : { res.write(lang._DBERR); break}
					}
					res.write("'");
				}
				res.write(" autocomplete=off></div><div class=form-group><label for=pass>"+lang._PASS+"</label><input class=form-control name=pass id=pass type=password></div><div class=form-group><div class=utility><div class=animated-checkbox><label><input type=checkbox name=rm><span class=label-text>"+lang._STAY+"</span></label></div><p class='semibold-text mb-2'><a href='#' name=flip>"+lang._FORGOT+"<i class='fa fa-fw fa-angle-right'></i></a></p></div></div><div class='form-group btn-container'><button type=submit class='btn btn-primary btn-block snd' name=log id=log><i class='fa fa-fw fa-lg fa-sign-in-alt'></i>"+lang._SEND+"</button></div></div></form><form class=forget-form action=register method=post><h3 class=login-head><i class='fa fa-fw fa-lg fa-lock'></i>"+lang._FORGOTPASS+"</h3><div class=form-group><label for=email>"+lang._EMAIL+"</label><input class=form-control name=email id=email value='"+session.name+"' autocomplete=off></div><div class='form-group mt-3'><p class='semibold-text mb-0'><a href='#' name=flip><i class='fa fa-fw fa-angle-left'></i>"+lang._BACK+"</a></p></div><div class='form-group btn-container'><button type=button class='btn btn-primary btn-block snd' name=fgt><i class='fa fa-fw fa-lg fa-unlock'></i>"+lang._SEND2+"</button></div></form><h2 class=cipher><i class='fa fa-fw fa-lock'></i>"+lang._CIPHER+"</h2></div></section>");
			
				// Scripts
				res.write("<script async src='https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/js/bootstrap.bundle.min.js' integrity='sha384-HwwvtgBNo3bZJJLYd8oVXjrBZt8cqVSpeBNS5n7C8IVInixGAoxmnlMuBnhbgrkm' crossorigin=anonymous></script><script nonce="+nonce+">const es=document.getElementsByName('flip');Array.from(es).forEach(function (e){e.addEventListener('click', function(){document.getElementById('login-box').classList.toggle('flipped');});});document.getElementById('log').addEventListener('click', function(){document.getElementById('content').classList.add('blured');document.getElementById('loader-wrap').style.display='block';});");
				res.end("</script></body></html>");
				break;
			}
		
			case '/main': {
				// Se nao estiver logado: volta pra pagina principal
				if (undefined === session.login) {
					logout(session,res);
					break;
				}

				break;
			}

			case '/login': {
				// Se ja estiver logado: desloga e volta pra pagina principal
				if (undefined !== session.login) {
					logout(session,res);
					break;
				}

				const buffers = [];
    			for await (const chunk of req) {
     				 buffers.push(chunk);
    			}

				console.log(buffers);

				logout(session,res);


				break;
			}

			case '/favicon.ico': {
				res.writeHead(200, {
					'content-type': 'image/x-icon',
				});
				res.end();
				break;
			}

			default: {
				res.writeHead(404, { 
					'content-type': 'text/html; charset=UTF-8',
				});
				res.end(session.path+' - Not found');
			}
		}
	});
}
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