const assert = require('assert')
const net = require('net')
const _ = require('lodash')
const util = require('util')

const config = {
	ubloxHost: process.env.UBLOX_PROXY_HOST || 'agps.u-blox.com',
	ubloxPort: process.env.UBLOX_PROXY_PORT || 46434,
	listenHost: process.env.UBLOX_PROXY_LISTEN_HOST || '0.0.0.0',
	listenPort: process.env.UBLOX_PROXY_LISTEN_PORT || 46434,
	cacheTime: process.env.UBLOX_PROXY_CACHE_TIME || 5*60*1000,
	cacheList: [{
		lat: 30.45,
		lon: 114.17,
		pacc: 1500000
	}],
}

function ubloxParamsStringify(obj) {
	const list = _.map(obj, (k, v) => `${v}=${k}`)
	return list.join(';')
}

function ubloxParamsParse(paramsString) {
	return _.reduce(paramsString.split(';'), (rs, v) => {
		const split = v.split('=')
		rs[split[0]] = split[1]
		return rs
	}, {})
}

function fetchUbloxAgpsData(params, tcpOption = { port: config.ubloxPort, host: config.ubloxHost }) {
	return new Promise((resolve, reject) => {
		let body = ''
		const client = net.createConnection(tcpOption, () => {
			client.write(ubloxParamsStringify(params))
		})
		client.on('data', (data) => {
			body += data
		})
		client.on('end', () => {
			resolve(body)
		})
		client.on('error', reject)
	})
}

class SocketSession {
	constructor(socket) {
		this.socket = socket
		this.socket.writeAsync = util.promisify(socket.write)
		this.logPrefix = `${this.socket.remoteAddress}@${this.socket.remotePort}`
		this.socket.setTimeout(10000)
		this.socket.on('timeout', () => {
			console.log(`${this.logPrefix} socket timeout`)
			this.socket.end()
		})
		this.socket.on('data', (data) => {
			const paramsString = data.toString()
			console.log(`${this.logPrefix} << ${paramsString}`)
			const params = ubloxParamsParse(paramsString)
			this.response({params})
				.then(() => this.socket.end())
				.catch((err) => {
					console.error(`${this.logPrefix}`, err)
					this.socket.end()
				})
		})
	}
	
	setCache(cache) {
		this.cache = cache
	}
	
	async ensureAndGetNearestCache(params) {
		assert(params.lat && params.lon, 'params must have lat and lon')
		assert(this.cache, 'SocketSession cache must not empty. e.g. {content: "", expired: Date.now() }')
		const nearest = _.minBy(this.cache, (o) => (params.lat - o.lat) * (params.lat - o.lat) + (params.lon - o.lon) * (params.lon - o.lon))
		if (Date.now() > nearest.expired) {
			console.log('Updating Cache')
			nearest.content = await fetchUbloxAgpsData(params, {host: config.ubloxHost, port: config.ubloxPort})
			nearest.expired = Date.now() + config.cacheTime
			console.log('Updated Cache', nearest)
		}
		return nearest.content
	}

	async response(req) {
		const content = await this.ensureAndGetNearestCache(req.params)
		await this.socket.writeAsync(content)
	}
}

const ubloxCache = _.map(config.cacheList, (e) => _.assign({}, e, {expired: Date.now()}))
const server = net.createServer((socket) => {
	new SocketSession(socket).setCache(ubloxCache)
}).on('error', (err) => {
	throw err
})

server.listen(config.listenPort, config.listenHost, () => {
	console.log('u-blox agps proxy listen @', server.address())
})

