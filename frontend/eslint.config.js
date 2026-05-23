import antfu from '@antfu/eslint-config'
import boundaries from 'eslint-plugin-boundaries'

export default antfu(
  {
    react: true,
    typescript: true,
  },
  {
    // shadcn/ui generated components export variants alongside components — suppress fast-refresh warning
    files: ['src/shared/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // AudioWorklet processors run in a different global scope (AudioWorkletGlobalScope)
    files: ['public/**/*.worklet.js'],
    languageOptions: {
      globals: {
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
        currentTime: 'readonly',
        currentFrame: 'readonly',
      },
    },
  },
  {
    rules: {
      'style/max-statements-per-line': 'off',
      'react/no-array-index-key': 'off',
    },
  },
  {
    // Clean-Architecture / FSD layer-boundary enforcement.
    // Dependency rule: data(driver) ← shared ← domain ← application/adapters ← ui.
    // See docs/architecture/clean-architecture-migration.md for the full rationale.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.app.json' },
      },
      'boundaries/elements': [
        // data/driver ring: IndexedDB gateway + React context providers (incl. feature-scoped
        // *Context.tsx). These deliver db/keys/player capabilities inward via DI. Listed BEFORE
        // `application` so provider files classify as `data`, not `application` (first match wins).
        // Real port-inversion behind interfaces is deferred to a later PR.
        { type: 'data', pattern: 'src/features/*/application/*Context.{ts,tsx}', mode: 'file' },
        { type: 'data', pattern: 'src/app/providers/**' },
        { type: 'data', pattern: 'src/db/**' },
        { type: 'shared', pattern: 'src/shared/**' },
        { type: 'domain', pattern: 'src/features/*/domain/**' },
        { type: 'application', pattern: 'src/features/*/application/**' },
        { type: 'adapters', pattern: 'src/features/*/adapters/**' },
        { type: 'ui', pattern: 'src/features/*/ui/**' },
        { type: 'feature-lib', pattern: 'src/features/*/lib/**' },
        // composition root: App, routing, Layout, onboarding, error chrome, pages.
        // Listed AFTER data so app/providers/** classifies as data, not app.
        { type: 'app', pattern: 'src/app/**' },
        // residual un-relocated code (should be empty after the app/ pass)
        { type: 'legacy', pattern: 'src/{components,hooks,lib}/**' },
      ],
    },
    rules: {
      'boundaries/element-types': ['error', {
        default: 'allow',
        rules: [
          {
            from: 'domain',
            disallow: ['application', 'adapters', 'ui', 'feature-lib', 'legacy', 'data', 'app'],
            // eslint-disable-next-line no-template-curly-in-string -- boundaries placeholder, not a JS template
            message: 'domain (inner ring) may import only shared — got ${dependency.type}',
          },
          {
            from: 'application',
            disallow: ['ui'],
            message: 'application must not import ui (dependency points outward)',
          },
          {
            from: 'adapters',
            disallow: ['application', 'ui'],
            message: 'adapters must not import application/ui',
          },
          {
            from: 'shared',
            disallow: ['domain', 'application', 'adapters', 'ui', 'feature-lib', 'legacy', 'app'],
            message: 'shared must not import feature/app code (it is the innermost utility ring)',
          },
        ],
      }],
    },
  },
)
