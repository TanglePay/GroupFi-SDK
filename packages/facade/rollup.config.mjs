import {createRollupConfig, decorateIifeExternal} from "../../rollup.config.mjs";
import pkg from './package.json' assert { type: "json" }
const config = createRollupConfig(pkg)

decorateIifeExternal(config[0],{
    
})
export default config
