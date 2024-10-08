import {createRollupConfig,decorateCjsExternal, decorateIifeExternal,decoratePlugin} from "../../rollup.config.mjs";
import replace from '@rollup/plugin-replace';
import pkg from './package.json' assert { type: "json" }
const config =  createRollupConfig(pkg)
decorateIifeExternal(config,{
    '@iota/iota.js': 'Iota',
    '@iota/crypto.js':'IotaCrypto',
    '@iota/util.js': 'IotaUtil',
    'big-integer':'bigInt',
})
decorateCjsExternal(config,{
    'tanglepaysdk-client': true,
    'tanglepaysdk-common': true,
})
decoratePlugin(config, replace({
    'process.env.NODE_ID': JSON.stringify(process.env.NODE_ENV == 'staging' ? 101 : 102),
}),true)
export default config
