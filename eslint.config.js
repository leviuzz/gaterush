// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * Pure packages must produce bit-identical results on every JavaScript engine and machine.
 * These APIs are either non-deterministic or "implementation-approximated" by ECMA-262,
 * so they are banned from production code in `packages/*` (tests may still use them).
 */
const NON_DETERMINISTIC_MATH = [
  'acos',
  'acosh',
  'asin',
  'asinh',
  'atan',
  'atan2',
  'atanh',
  'cbrt',
  'cos',
  'cosh',
  'exp',
  'expm1',
  'hypot',
  'log',
  'log10',
  'log1p',
  'log2',
  'pow',
  'sin',
  'sinh',
  'tan',
  'tanh',
];

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/coverage/**',
      'out/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },
  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Non-deterministic. Use a seeded stream from @gateflow/sim-kernel.',
        },
        { object: 'Date', property: 'now', message: 'Non-deterministic. Pass time explicitly.' },
        {
          object: 'performance',
          property: 'now',
          message: 'Non-deterministic. Pass time explicitly.',
        },
        ...NON_DETERMINISTIC_MATH.map((property) => ({
          object: 'Math',
          property,
          message:
            'Implementation-approximated by ECMA-262. Use the deterministic functions in @gateflow/sim-kernel (dmath) or integer arithmetic.',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Wall-clock and locale dependent. Use integer milliseconds.',
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: 'Wall-clock and locale dependent. Use integer milliseconds.',
        },
        {
          selector: "BinaryExpression[operator='**']",
          message: 'Exponentiation is implementation-approximated. Use multiplication or dmath.',
        },
        {
          selector: "AssignmentExpression[operator='**=']",
          message: 'Exponentiation is implementation-approximated. Use multiplication or dmath.',
        },
        {
          selector: "CallExpression[callee.property.name='localeCompare']",
          message: 'Locale-dependent ordering. Compare strings with < and >.',
        },
        {
          selector: "CallExpression[callee.property.name='toLocaleString']",
          message: 'Locale-dependent formatting.',
        },
        {
          selector: "MemberExpression[object.name='Intl']",
          message: 'Locale-dependent behaviour.',
        },
      ],
    },
  },
  {
    files: ['**/test/**/*.ts', '**/e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
