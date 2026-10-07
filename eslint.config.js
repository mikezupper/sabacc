// ESLint runs only Gyral's template rules (`npm run lint:templates`): the template rules
// and pure `each` rows, in the editor and in `npm run check`. Layers, purity and doc links
// are checked by `npm run lint:arch` instead.
import tsParser from "@typescript-eslint/parser"
import gyral from "@gyral/core/eslint"

export default [
  {
    files: ["src/components/**/*.ts", "src/scene/**/*.ts"],
    languageOptions: { parser: tsParser },
    ...gyral.configs.recommended,
  },
]
