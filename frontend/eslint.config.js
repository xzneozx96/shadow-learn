import antfu from '@antfu/eslint-config'

export default antfu(
  {
    react: true,
    typescript: true,
  },
  {
    // shadcn/ui generated components export variants alongside components — suppress fast-refresh warning
    files: ['src/components/ui/**/*.tsx'],
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
)
