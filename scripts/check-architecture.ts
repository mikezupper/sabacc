// CLI for `npm run lint:arch`. Rules live in ./architecture-rules.ts.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { checkDocs, checkSources, type SourceFile } from "./architecture-rules.ts"

const root = join(import.meta.dirname, "..")

const walk = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

const load = (paths: ReadonlyArray<string>): ReadonlyArray<SourceFile> =>
  paths.map((p) => ({ path: relative(root, p).split("\\").join("/"), text: readFileSync(p, "utf8") }))

const sources = load(walk(join(root, "src")))
const topLevel = ["AGENTS.md", "ARCHITECTURE.md", "README.md", "CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md"]
const docs = load([...topLevel.map((name) => join(root, name)), ...walk(join(root, "docs")).filter((p) => p.endsWith(".md"))])

const violations = [...checkSources(sources), ...checkDocs(docs, (p) => existsSync(join(root, p)))]

for (const v of violations) console.error(`${v.path}: [${v.rule}] ${v.message}`)
console.log(
  violations.length === 0
    ? `lint:arch ok (${sources.length} source files, ${docs.length} docs)`
    : `lint:arch failed: ${violations.length} violation(s)`,
)
process.exitCode = violations.length === 0 ? 0 : 1
