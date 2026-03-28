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
    rules: {
      'style/max-statements-per-line': 'off',
    },
  },
)
