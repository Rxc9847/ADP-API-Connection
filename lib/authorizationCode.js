'use strict';

var log = require('winston');
var readCerts = require('./readCerts');
var fs = require('fs');
var _ = require('underscore');
var config = require('config');
var Post = require('./post');

class AuthorizationCode {

	constructor(conn) {
		this.granttype = conn.granttype;
		this.conn = conn;
	}

	init(opts, cb) {
		if(opts.keepAlive){
			log.warn('Session KeepAlive not allowed for Authorization Code Grant Type.');
		}
		this.opts = opts;
		this.authCode = opts.authCode;
		this.cb = cb;
		this.getCerts();
	}

	getCerts() {
		readCerts({app: this.app, certs: this.opts.certs}, (err, certs) => {
			if(err) {
				return this.cb(err, certs);
			}
			this.certs = certs;
			this.getAccessToken();
		});
	}

	authorizationUrl(connection) {
		var authorizationurl = connection.authorizationUrl || config.get('connect.authorizationurl');
		var clientId = connection.clientId || config.get('connect.client.id');
		var clientSecret = connection.clientSecret || config.get('connect.client.secret');
		var callbackUrl = connection.callbackUrl || config.get('connect.callbackurl');

		if(!authorizationurl) {
			throw Error('Missing authorization url. Check `config>default.js>connect.authorizationurl` value.');
		}
		if(!clientId || !clientSecret) {
			throw Error('Missing client information. Check `config>default.js>connect.client` configuration.');
		}
		if(!callbackUrl) {
			throw Error('Missing callback url information. Check `config>default.js>connect.callbackurl` value.');
		}

		return encodeURI(
			authorizationurl +
			'?client_id=' + clientId +
			'&response_type=code' +
			'&redirect_uri=' + callbackUrl +
			'&scope=openid' +
			'&state=' + Math.random());
	}

	setTokenExpiration(token) {
		this.tokenEpiration = (token.expires_in || config.get('connect.defaultexpiration')) * 1000;
	}

	getAccessToken() {
		var options = {
			requestDesc: 'Authorization Code - Access Token Request',
			app: this.app,
			url: this.opts.tokenurl || config.get('connect.tokenurl'),
			payload: this.buildTokenRequestBody()
		};
		new Post(options, this.parseTokenResponse.bind(this));
	}

	parseTokenResponse(err, token) {
		if(err) {
			log.error('Get access token retuned error.' + err);
		}
		if(!token || !token.access_token) {
			log.error('Unable to retrieve access token.');
		} else {
			this.setTokenExpiration(token);
		}
		this.cb(err, token);
	}

	buildTokenRequestBody() {
		var clientId = this.opts.clientid || config.get('connect.client.id');
		var clientSecret = this.opts.clientsecret || config.get('connect.client.secret');
		var callbackUrl = this.opts.callbackurl || config.get('connect.callbackurl');
		var pem = _.where(this.certs, {type: 'pem'})[0];
		var key = _.where(this.certs, {type: 'key'})[0];

		if(!clientId || !clientSecret) {
			throw Error('Missing client information. Check `config>default.js>connect.client` configuration.');
		}

		var payload = {
			agentOptions: {
				ca: [fs.readFileSync(pem.path)],
				key: fs.readFileSync(key.path),
				cert: fs.readFileSync(pem.path)
			},
			strictSSL: false,
			form: {
				grant_type: this.granttype,
				code: this.authCode,
				redirect_uri: callbackUrl,
				client_id: clientId,
				client_secret: clientSecret
			}
		};
		return payload;
	}
}

module.exports = AuthorizationCode;