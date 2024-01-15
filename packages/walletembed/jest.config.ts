import type {Config} from 'jest';
import { baseConfigProject } from '../../jest.base';
baseConfigProject.displayName = 'util';
const config: Config = {
    projects: [
    baseConfigProject,
    ],
}

export default config;