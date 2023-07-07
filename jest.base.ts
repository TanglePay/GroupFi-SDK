export const baseConfigProject = {
    // An array of file extensions your modules use
     moduleFileExtensions: [
       "js",
       "mjs",
       "cjs",
       "jsx",
       "ts",
       "tsx",
       "json",
       "node"
     ],
    preset: 'ts-jest',
    // "resetMocks" resets all mocks, including mocked modules, to jest.fn(),
    // between each test case.
    resetMocks: true,
    // "restoreMocks" restores all mocks created using jest.spyOn to their
    // original implementations, between each test. It does not affect mocked
    // modules.
    restoreMocks: true,
    moduleDirectories: [
        "node_modules",
        "../../node_modules",
        "src"
    ],
    displayName: 'test display name not set',
    testEnvironment: 'node',
    testMatch: [
    '**/*.test.ts',
    ],
    "transform": {
      "../../node_modules/variables/.+\\.(j|t)sx?$": "ts-jest"
    },
    "transformIgnorePatterns": [
      "../../node_modules/(?!variables/.*)"
    ]
  }

export function generateRandomString(length: number): string {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }