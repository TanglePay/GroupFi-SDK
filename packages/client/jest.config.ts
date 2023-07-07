import type {Config} from 'jest';
import { baseConfigProject } from '../../jest.base';
baseConfigProject.displayName = 'client';
const config: Config = {
    projects: [
    baseConfigProject,
    ],
}

export default config;