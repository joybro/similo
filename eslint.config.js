import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        ignores: ['dist/', 'node_modules/']
    },
    {
        files: ['src/**/*.ts'],
        rules: {
            'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
            'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            'no-console': 'off'
        }
    }
);
