// eslint.config.js

/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable @typescript-eslint/naming-convention */

import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import tseslint from 'typescript-eslint';

export default [
    // Plugins
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    jsdoc.configs['flat/recommended-typescript'],
    eslintConfigPrettier,
    importPlugin.flatConfigs.recommended,
    // /Plugins
    {
        settings: {
            'import/resolver': {
                typescript: true,
                node: true,
            },
        },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: true,
                sourceType: 'module',
            },
        },
        rules: {
            'unicode-bom': ['error', 'never'],
            '@typescript-eslint/explicit-function-return-type': 'warn',
            '@typescript-eslint/explicit-module-boundary-types': 'error',
            'no-var': 'off',
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'VariableDeclaration[kind=\'var\'][declare!=true]',
                    message: 'Unexpected var, use let or const instead.',
                },
            ],
            eqeqeq: 'warn',
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'spaced-comment': ['warn', 'always'],
            'no-irregular-whitespace': [
                'error',
                {
                    skipStrings: true,
                    skipRegExps: true,
                    skipTemplates: true,
                }
            ],
            // Import rules
            'import/no-unresolved': 'error',
            'import/extensions': [
                'error',
                'never',
            ],
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['../*'],
                            message: 'Parent directory imports are not allowed. Use @/ alias instead (e.g., import { foo } from \'@/utils/foo\').',
                        },
                        {
                            // 'import/extensions' rule does not work well with 'import/resolver' typescript settings, so we restrict here instead
                            group: ['./**/*.js', './*.js', '@/**/*.js'],
                            message: 'Do not use .js extension in imports. TypeScript will resolve the correct file.',
                        },
                    ],
                },
            ],
            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'default',
                    format: ['camelCase'],
                },
                {
                    selector: 'variable',
                    format: ['camelCase', 'UPPER_CASE'],
                    leadingUnderscore: 'allow',
                },
                {
                    selector: 'parameter',
                    format: ['camelCase'],
                    leadingUnderscore: 'allow',
                },
                {
                    selector: 'memberLike',
                    modifiers: ['private'],
                    format: ['camelCase'],
                    leadingUnderscore: 'require',
                },
                {
                    selector: 'typeLike',
                    format: ['PascalCase'],
                },
                {
                    selector: 'import',
                    format: ['camelCase', 'PascalCase'],
                },
                {
                    selector: [
                        'classProperty',
                        'objectLiteralProperty',
                        'typeProperty',
                        'classMethod',
                        'objectLiteralMethod',
                        'typeMethod',
                        'accessor',
                        'enumMember',
                    ],
                    format: null,
                    modifiers: ['requiresQuotes'],
                },
            ],
            'jsdoc/check-param-names': [
                'error',
                {
                    checkDestructured: false,
                },
            ],
            'jsdoc/require-param': [
                'error',
                {
                    checkDestructured: false,
                },
            ],
            'jsdoc/require-param-description': 'error',
            'jsdoc/require-returns': 'error',
            'jsdoc/require-param-type': 'off',
            'jsdoc/require-returns-type': 'off',
            'jsdoc/require-jsdoc': [
                'error',
                {
                    publicOnly: true,
                    require: {
                        ArrowFunctionExpression: true,
                        ClassDeclaration: true,
                        ClassExpression: true,
                        FunctionDeclaration: true,
                        FunctionExpression: true,
                        MethodDefinition: true,
                    },
                    contexts: [
                        'ArrowFunctionExpression',
                        'FunctionDeclaration',
                        'FunctionExpression',
                        'MethodDefinition',
                        'Property',
                        'TSDeclareFunction',
                        'TSEnumDeclaration',
                        'TSInterfaceDeclaration',
                        'TSMethodSignature',
                        'TSPropertySignature',
                        'TSTypeAliasDeclaration',
                        'VariableDeclaration',
                    ],
                },
            ],
        },
    }
];
