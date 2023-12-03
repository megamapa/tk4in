/********************************************************/
/* Utils                                                */
/* Algoritmos e rotinas usados nos app's                */
/********************************************************/
"use strict";

async function getDate() {
	let offset = new Date(new Date().getTime()).getTimezoneOffset();
	return new Date(new Date().getTime() - (offset*60*1000)).toISOString().replace(/T/,' ').replace(/\..+/, '');
}

//import { randomBytes } from "node:crypto"

async function RandomNum(min, max) {  
	return Math.floor( Math.random() * (max - min) + min)
}

// Gera uma USID - Unique Session ID
async function getUSID() {
	res1 = await RandomNum(111,999);
	res2 = await RandomNum(20199,99199);
	res3 = await RandomNum(10,99);
	res4 = await RandomNum(10,99);
	res5 = await RandomNum(10199,99999);
	return('TK-'+Version+'.'+res1+'.'+res2+'.'+res3+'.'+res4+'.'+res5);
}

module.exports = { getDate, getUSID }