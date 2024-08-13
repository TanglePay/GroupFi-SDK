import {createRollupConfig, decorateIifeExternal, decoratePlugin} from "../../rollup.config.mjs";
import replace from '@rollup/plugin-replace';
import pkg from './package.json' assert { type: "json" }
const config =  createRollupConfig(pkg)

decorateIifeExternal(config[0],{
    '@iota/iota.js': 'Iota',
    '@iota/crypto.js':'IotaCrypto',
    '@iota/util.js': 'IotaUtil',
    'big-integer':'bigInt',
})
decoratePlugin(config, replace({
    'process.env.INX_GROUPFI_DOMAIN': JSON.stringify(process.env.INX_GROUPFI_DOMAIN || ""),
    'process.env.AUXILIARY_SERVICE_DOMAIN': JSON.stringify(process.env.AUXILIARY_SERVICE_DOMAIN || ""),
    'process.env.IMAGE_PRESIGN_SERVICE_URL': JSON.stringify(process.env.IMAGE_PRESIGN_SERVICE_URL || ""),
}), true);
export default config
