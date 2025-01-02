import {createRollupConfig, decorateCjsExternal, decorateIifeExternal,decoratePlugin} from "../../rollup.config.mjs";
import replace from '@rollup/plugin-replace';
import pkg from './package.json' assert { type: "json" }
const config = createRollupConfig(pkg)

decorateIifeExternal(config,{
    '@iota/iota.js': 'Iota',
    '@iota/crypto.js':'IotaCrypto',
    '@iota/util.js': 'IotaUtil',
    'big-integer':'bigInt',
})
decoratePlugin(config, replace({
    'process.env.AUXILIARY_SERVICE_DOMAIN': JSON.stringify(process.env.NODE_ENV == 'staging' ? "testapi.groupfi.ai" : "api.groupfi.ai"),
}),true)
export default config
