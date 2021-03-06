const assert = require('assert')
const net = require('net')
const _ = require('lodash')
const util = require('util')
const logger = require('@brickyard/logger')
const geoList = require('./geo-list')

logger.hackConsole()

const config = {
	ubloxHost: process.env.UBLOX_PROXY_HOST || 'agps.u-blox.com',
	ubloxPort: process.env.UBLOX_PROXY_PORT || 46434,
	listenHost: process.env.UBLOX_PROXY_LISTEN_HOST || '0.0.0.0',
	listenPort: process.env.UBLOX_PROXY_LISTEN_PORT || 46434,
	socketTimeout: process.env.UBLOX_PROXY_SOCKET_TIMEOUT || 20000,
	cacheTime: process.env.UBLOX_PROXY_CACHE_TIME || 5 * 60 * 1000,
	cacheList: geoList,
}

function ubloxParamsStringify(obj) {
	const list = _.map(obj, (k, v) => `${v}=${k}`)
	return list.join(';')
}

function ubloxParamsParse(paramsString) {
	const rs = {}
	paramsString.split(';').forEach((e) => {
		const [key, value] = e.split('=')
		rs[key] = value
	})
	return rs
}

function fetchUbloxAgpsData(params, tcpOption = { port: config.ubloxPort, host: config.ubloxHost }) {
	return new Promise((resolve, reject) => {
		let buf = Buffer.alloc(0)
		const client = net.createConnection(tcpOption, () => {
			client.write(ubloxParamsStringify(params))
		})
		client.on('data', (data) => {
			buf = Buffer.concat([buf, data])
		})
		client.on('end', () => {
			resolve(buf)
		})
		client.on('error', reject)
	})
}

class SocketSession {
	constructor(socket) {
		this.socket = socket
		this.socket.writeAsync = util.promisify(socket.write)
		this.logPrefix = `${this.socket.remoteAddress}@${this.socket.remotePort}`
		this.socket.setTimeout(config.socketTimeout)
		this.socket.on('timeout', () => {
			console.log(`${this.logPrefix} socket timeout`)
			this.socket.end()
		})
		this.socket.on('data', (data) => {
			const paramsString = data.toString()
			console.log(`${this.logPrefix} << ${paramsString}`)
			const params = ubloxParamsParse(paramsString)
			this.response({ params })
				.then(() => this.socket.end())
				.catch((err) => {
					console.error(`${this.logPrefix} ${err}`)
					this.socket.end()
				})
		})
		this.socket.on('error', (err) => {
			console.error(`${this.logPrefix} ${err}`)
		})
	}

	setCache(cache) {
		this.cache = cache
	}

	async ensureAndGetNearestCache(params) {
		assert(params.lat && params.lon, 'params must have lat and lon')
		assert(this.cache, 'SocketSession cache must not empty. e.g. {content: "", expired: Date.now() }')
		const nearest = _.minBy(this.cache, o => ((params.lat - o.lat) * (params.lat - o.lat)) + ((params.lon - o.lon) * (params.lon - o.lon)))
		if (Date.now() > nearest.expired && !nearest.lock) {
			const reqParams = _.assign({}, params, _.pick(nearest, 'lat', 'lon', 'pacc'))
			try {
				nearest.lock = true
				nearest.content = await fetchUbloxAgpsData(reqParams)
			} catch (e) {
				console.error(e.message)
			} finally {
				nearest.lock = false
			}
			nearest.expired = Date.now() + config.cacheTime
			console.log('Updated Cache', nearest)
		}
		return nearest.content
	}

	async response(req) {
		const content = await this.ensureAndGetNearestCache(req.params)
		if (!content) {
			console.error('Can not fetch ublox agps data')
		}
		if (!this.socket.destroyed) {
			await this.socket.writeAsync(content)
		}
	}
}

const ubloxCache = _.map(config.cacheList, e => _.assign({}, e, { expired: Date.now() }))
const server = net.createServer((socket) => {
	new SocketSession(socket).setCache(ubloxCache)
}).on('error', (err) => {
	throw err
})

server.listen(config.listenPort, config.listenHost, () => {
	console.log('u-blox agps proxy listen @', server.address())
})

