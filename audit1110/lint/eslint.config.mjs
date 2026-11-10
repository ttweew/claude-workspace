// 總體檢（11/10）：只開「會是 bug」的規則，不管寫法風格
import globals from 'globals';
const bugs = {
    'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }], 'no-dupe-keys': 'error', 'no-dupe-args': 'error',
    'no-dupe-class-members': 'error', 'no-dupe-else-if': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error', 'no-self-assign': 'error',
    'no-self-compare': 'error', 'no-const-assign': 'error', 'no-func-assign': 'error', 'no-import-assign': 'error', 'no-redeclare': 'error',
    'no-cond-assign': 'error', 'no-constant-condition': ['error', { checkLoops: false }], 'no-constant-binary-expression': 'error', 'use-isnan': 'error',
    'valid-typeof': 'error', 'no-unsafe-negation': 'error', 'no-unsafe-optional-chaining': 'error', 'no-loss-of-precision': 'error',
    'no-sparse-arrays': 'error', 'no-fallthrough': 'error', 'getter-return': 'error', 'no-setter-return': 'error', 'no-async-promise-executor': 'error',
    'no-compare-neg-zero': 'error', 'no-ex-assign': 'error', 'no-invalid-regexp': 'error', 'no-misleading-character-class': 'error',
    'no-prototype-builtins': 'warn', 'no-unused-private-class-members': 'warn', 'no-useless-backreference': 'error', 'for-direction': 'error',
    'array-callback-return': 'error', 'no-unmodified-loop-condition': 'warn', 'no-shadow-restricted-names': 'error', 'no-template-curly-in-string': 'warn',
    'no-promise-executor-return': 'warn', 'require-atomic-updates': 'off', 'eqeqeq': ['warn', 'smart'], 'no-empty': ['warn', { allowEmptyCatch: true }]
};
export default [
    { files: ['**/js/**/*.js'], ignores: ['**/js/ai/pose-worker.js', '**/js/data/*-worker.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } }, rules: bugs },
    { files: ['**/js/ai/pose-worker.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.worker } }, rules: bugs },
    { files: ['**/js/data/*-worker.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.worker } }, rules: bugs },
    { files: ['**/sw.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.serviceworker } }, rules: bugs },
    { files: ['**/tests/**/*.mjs', '**/tools/**/*.mjs'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node, ...globals.browser } }, rules: bugs }
];
