module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testTimeout: 30000,
  // Some transitive dependencies of isomorphic-dompurify (jsdom ->
  // html-encoding-sniffer -> @exodus/bytes) ship ESM-only sources. Node 22+
  // can require them, Jest's CommonJS runtime cannot, so they are transpiled.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {}],
    '^.+\\.m?js$': [
      'ts-jest',
      {
        diagnostics: false,
        isolatedModules: true,
        tsconfig: {
          allowJs: true,
          module: 'CommonJS',
          target: 'ES2020',
          esModuleInterop: true,
        },
      },
    ],
  },
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\](?!(?:.*[/\\\\])?(?:' +
      [
        '@exodus[/\\\\]bytes',
        '@asamuzakjp[/\\\\][^/\\\\]+',
        '@csstools[/\\\\][^/\\\\]+',
        '@adobe[/\\\\]css-tools',
        '@ungap[/\\\\]structured-clone',
        'parse5',
        'entities',
        'lru-cache',
        'tough-cookie',
        'psl',
        'css-tree',
        'nanoid',
        'whatwg-encoding',
        'html-encoding-sniffer',
      ].join('|') +
      ')[/\\\\])',
  ],
};
