
if (!globalThis.fetch) {
    const fetch = require('node-fetch')
    const HttpsProxyAgent = require('https-proxy-agent');
    const proxyAgent = new HttpsProxyAgent('http://127.0.0.1:7890');
    globalThis.fetch = async(...args) => {
        const neoInit = Object.assign({},args[1],{})
        const neoArgs = [args[0],neoInit]
        return await fetch(...neoArgs)
    }
}