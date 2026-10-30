// ESLint runs only Gyral's recommended rules (`npm run lint:templates`): the template rules,
// pure `each` rows, intents bound to their parser's event (`gyral/intent-event`) and Gyral's
// built-ins over hand-written versions (`gyral/prefer-built-in`), in the editor and in
// `npm run check`. Layers, purity and doc links are checked by `npm run lint:arch` instead.
import tsParser from "@typescript-eslint/parser"
import gyral from "@gyral/core/eslint"

export default [
  { ignores: [".drive/**", ".gyral/**", "dist/**"] },
  {
    files: ["src/components/**/*.ts", "src/scene/**/*.ts"],
    languageOptions: { parser: tsParser },
    ...gyral.configs.recommended,
  },
]
