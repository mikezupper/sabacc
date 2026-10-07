// Pure rule set behind `npm run lint:arch`. Every message says how to fix the
// problem, because the reader is usually an agent with no other context.

export interface SourceFile {
  readonly path: string // repo-relative, forward slashes
  readonly text: string
}

export interface Violation {
  readonly path: string
  readonly rule: string
  readonly message: string
}

type Layer = "domain" | "protocol" | "state" | "presentation" | "components" | "scene" | "server" | "styles" | "entry" | "other"

const layerOf = (path: string): Layer => {
  if (path.startsWith("src/domain/")) return "domain"
  if (path.startsWith("src/protocol/")) return "protocol"
  if (path.startsWith("src/server/")) return "server"
  if (path.startsWith("src/state/")) return "state"
  if (path.startsWith("src/presentation/")) return "presentation"
  if (path.startsWith("src/components/")) return "components"
  if (path.startsWith("src/scene/")) return "scene"
  if (path.startsWith("src/styles/")) return "styles"
  if (path === "src/entry-client.ts" || path === "src/entry-3d.ts" || path === "src/entry-table.ts") return "entry"
  return "other"
}

/** Gyral (the UI framework) belongs to the view layers only: components and scene. */
const GYRAL = ["@gyral/core", "@gyral/time", "@gyral/http"] // subpaths too (@gyral/time/delay)

// Allowed targets per layer: internal layers plus package names (prefix match).
const allowed: Record<Exclude<Layer, "entry" | "other">, { layers: ReadonlyArray<Layer>; packages: ReadonlyArray<string> }> = {
  domain: { layers: ["domain"], packages: ["effect"] },
  // The wire format shared by browser and server.
  protocol: { layers: ["protocol", "domain"], packages: ["effect"] },
  state: { layers: ["state", "protocol", "domain"], packages: ["effect"] },
  // The multiplayer server (Node). Never imports browser code.
  server: { layers: ["server", "protocol", "domain"], packages: ["effect", "@effect/platform", "@effect/platform-node", "node:"] },
  presentation: { layers: ["presentation", "domain"], packages: ["effect"] },
  components: {
    layers: ["components", "state", "presentation", "domain", "styles"],
    packages: ["effect", ...GYRAL],
  },
  // The 3D view: Three.js lives only here, so the 2D page never ships it.
  scene: {
    layers: ["scene", "components", "state", "presentation", "domain", "styles"],
    packages: ["three", "effect", ...GYRAL],
  },
  // Shared CSS as plain text: no imports at all.
  styles: { layers: ["styles"], packages: [] },
}

const importSpecifiers = (text: string): ReadonlyArray<string> =>
  [...text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|(?:^|\n)\s*import\s*["']([^"']+)["']/g)]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? "")
    .filter((s) => s !== "")

const resolve = (from: string, spec: string): string => {
  const parts = from.split("/").slice(0, -1)
  for (const seg of spec.split("/")) {
    if (seg === "..") parts.pop()
    else if (seg !== ".") parts.push(seg)
  }
  return parts.join("/")
}

const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")

const domainBans: ReadonlyArray<{ pattern: RegExp; rule: string; fix: string }> = [
  { pattern: /\bthrow\b/, rule: "domain-no-throw", fix: "return a Data.TaggedError through Effect.fail instead of throwing" },
  { pattern: /\btry\s*\{/, rule: "domain-no-try", fix: "model failure in the Effect error channel; the domain never catches" },
  { pattern: /\basync\b|\bawait\b/, rule: "domain-no-async", fix: "write the step as an Effect (Effect.gen) instead of async/await" },
  { pattern: /Math\.random/, rule: "domain-no-math-random", fix: "use the Random service (Random.nextIntBetween / Random.shuffle) so games replay from a seed" },
  { pattern: /Date\.now|new Date\b/, rule: "domain-no-clock", fix: "the rules don't need time; if they ever do, use the Clock service" },
  { pattern: /:\s*any\b|as any\b|<any>/, rule: "domain-no-any", fix: "give the value a real type or decode it with Schema" },
  { pattern: /\b(window|document|localStorage|globalThis)\s*\.|\bHTMLElement\b/, rule: "domain-no-dom", fix: "the domain is DOM-free; move browser access to src/state or src/components" },
  { pattern: /\bclass\s+\w+\s+(?!extends\s+Data\.)\S/, rule: "domain-no-class", fix: "model data as readonly interfaces or Data.TaggedEnum; only Data.TaggedError / Data.Class may be classes" },
  { pattern: /[\w)\]]!\.|[\w)\]]!\)|[\w)\]]!;/, rule: "domain-no-non-null", fix: "handle absence with Option or a pattern match instead of a non-null assertion" },
]

/** The only places Effects are run: the browser store and the server's entry point. */
const RUNTIMES = ["src/state/store.ts", "src/server/main.ts"]

const MAX_DOMAIN_LINES = 300
const MAX_SRC_LINES = 400
const MAX_AGENTS_LINES = 120

export const checkSources = (files: ReadonlyArray<SourceFile>): ReadonlyArray<Violation> => {
  const out: Array<Violation> = []
  for (const f of files) {
    if (!f.path.startsWith("src/")) continue
    if (/\.(jsx|tsx)$/.test(f.path)) {
      out.push({ path: f.path, rule: "no-react", message: "JSX/React files are not allowed; build UI as Gyral components in src/components (see docs/FRONTEND.md)" })
      continue
    }
    const layer = layerOf(f.path)
    const lines = f.text.split("\n").length
    if (lines > MAX_SRC_LINES || (layer === "domain" && lines > MAX_DOMAIN_LINES)) {
      out.push({ path: f.path, rule: "file-size", message: `${lines} lines is over the limit (${layer === "domain" ? MAX_DOMAIN_LINES : MAX_SRC_LINES}); split the module by responsibility` })
    }
    if (layer === "entry" || layer === "other") continue
    const rules = allowed[layer]
    for (const spec of importSpecifiers(f.text)) {
      if (spec.startsWith(".")) {
        const target = layerOf(resolve(f.path, spec) + ".ts")
        if (!rules.layers.includes(target)) {
          out.push({ path: f.path, rule: "layer-edge", message: `${layer} must not import ${target} ("${spec}"). Allowed: ${rules.layers.join(", ")}. See ARCHITECTURE.md "Layers and allowed imports"` })
        }
      } else if (!rules.packages.some((p) => spec === p || spec.startsWith(p.endsWith(":") ? p : p + "/"))) {
        out.push({ path: f.path, rule: "layer-package", message: `${layer} must not import package "${spec}". Allowed: ${rules.packages.join(", ")}. See ARCHITECTURE.md` })
      }
    }
    if (layer === "domain") {
      const code = stripComments(f.text)
      for (const ban of domainBans) {
        if (ban.pattern.test(code)) out.push({ path: f.path, rule: ban.rule, message: `src/domain must stay pure: ${ban.fix}` })
      }
    }
    if (/export\s+(const|function|let|var)\s+then\b|export\s*\{[^}]*\bthen\b[^}]*\}/.test(f.text)) {
      out.push({ path: f.path, rule: "no-then-export", message: "don't export `then`: a module namespace with `then` is treated as a promise when awaited or dynamically imported; rename it" })
    }
    if (f.text.match(/Effect\.run(Sync|Promise|Fork|Callback)|runMain\(/) && !RUNTIMES.includes(f.path)) {
      out.push({ path: f.path, rule: "single-runtime", message: "Effects run only in src/state/store.ts (browser) and src/server/main.ts (server); return the Effect and let those run it" })
    }
  }
  return out
}

export const checkDocs = (files: ReadonlyArray<SourceFile>, exists: (path: string) => boolean): ReadonlyArray<Violation> => {
  const out: Array<Violation> = []
  for (const f of files) {
    if (!f.path.endsWith(".md")) continue
    if (f.path === "AGENTS.md" && f.text.split("\n").length > MAX_AGENTS_LINES) {
      out.push({ path: f.path, rule: "agents-map-size", message: `AGENTS.md is a map, keep it under ${MAX_AGENTS_LINES} lines; move detail into docs/ and link to it` })
    }
    for (const m of f.text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      const link = m[1] ?? ""
      if (/^[a-z]+:/.test(link)) continue
      const target = resolve(f.path, link).replace(/\/$/, "")
      if (!exists(target)) {
        out.push({ path: f.path, rule: "doc-link", message: `broken link to "${link}"; fix the path or remove the link (docs are the system of record)` })
      }
    }
  }
  return out
}
