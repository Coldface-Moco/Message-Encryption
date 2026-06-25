import js from '@eslint/js'
        import globals from 'globals'
        import reactHooks from 'eslint-plugin-react-hooks'
        import reactRefresh from 'eslint-plugin-react-refresh'
        import tseslint from '@typescript-eslint/eslint-plugin'
        import tsParser from '@typescript-eslint/parser'
        import react from 'eslint-plugin-react'
        import importPlugin from 'eslint-plugin-import'

        export default [
          {
            ignores: ['dist', 'node_modules', '*.config.js', '*.config.ts', '.skills/**']
          },
          {
            files: ['**/*.{js,jsx,ts,tsx}'],
            languageOptions: {
              ecmaVersion: 2020,
              globals: globals.browser,
              parser: tsParser,
              parserOptions: {
                ecmaVersion: 'latest',
                ecmaFeatures: { jsx: true },
                sourceType: 'module',
              }
            },
            settings: {
              react: { version: '18.2' },
              'import/resolver': {
                node: {
                  extensions: ['.js', '.jsx', '.ts', '.tsx']
                }
              }
            },
            plugins: {
              react,
              'react-hooks': reactHooks,
              'react-refresh': reactRefresh,
              '@typescript-eslint': tseslint,
              import: importPlugin
            },
            rules: {
              ...js.configs.recommended.rules,
              ...react.configs.recommended.rules,
              ...react.configs['jsx-runtime'].rules,
              ...reactHooks.configs.recommended.rules,
              ...tseslint.configs.recommended.rules,

              'react/react-in-jsx-scope': 'off',
              'react/prop-types': 'off',
              'react/jsx-uses-react': 'off',
              'react/jsx-uses-vars': 'off',
              'react/jsx-key': 'error',
              'react/jsx-no-duplicate-props': 'error',
              'react/jsx-no-undef': 'error',
              'react/no-unescaped-entities': 'off',
              'react/display-name': 'off',

              'react-hooks/rules-of-hooks': 'error',
              'react-hooks/exhaustive-deps': 'warn',

              'react-refresh/only-export-components': [
                'warn',
                { allowConstantExport: true }
              ],

              '@typescript-eslint/no-unused-vars': 'off',
              '@typescript-eslint/no-explicit-any': 'off',
              '@typescript-eslint/explicit-function-return-type': 'off',
              '@typescript-eslint/explicit-module-boundary-types': 'off',
              '@typescript-eslint/no-empty-function': 'off',
              '@typescript-eslint/no-empty-object-type': 'off',

              'no-unused-vars': 'off',
              'prefer-const': 'off',
              'no-var': 'error',
              'object-shorthand': 'off',
              'prefer-template': 'off',
            }
          },
          {
            files: ['**/*.ts', '**/*.tsx'],
            rules: {
                'no-undef': 'off',
            }
          }
        ]
        