import {createRollupConfig, decorateIifeExternal, decoratePlugin} from "../../rollup.config.mjs";
import replace from '@rollup/plugin-replace';
import pkg from './package.json' assert { type: "json" }
const config =  createRollupConfig(pkg)

decorateIifeExternal(config[0],{
    '@iota/crypto.js':'IotaCrypto',
    '@iota/util.js': 'IotaUtil',
    'big-integer':'bigInt',
})
decoratePlugin(config, replace({
    'process.env.INX_GROUPFI_DOMAIN': JSON.stringify(process.env.NODE_ENV == 'staging' ? "mainnet.shimmer.node.tanglepay.com" : "prerelease.api.iotacat.com"),
}),true)
export default config
