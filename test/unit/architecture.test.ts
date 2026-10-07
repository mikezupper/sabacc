import { describe, expect, it } from "vitest"
import { checkDocs, checkSources } from "../../scripts/architecture-rules.ts"

const rules = (path: string, text: string) => checkSources([{ path, text }]).map((v) => v.rule)

describe("architecture rules", () => {
  it("rejects a domain file importing lit, with a remediation message", () => {
    const [v] = checkSources([{ path: "src/domain/x.ts", text: `import { html } from "lit"\n` }])
    expect(v?.rule).toBe("layer-package")
    expect(v?.message).toContain("ARCHITECTURE.md")
  })

  it("rejects upward edges between layers", () => {
    expect(rules("src/domain/x.ts", `import { store } from "../state/store.js"\n`)).toContain("layer-edge")
    expect(rules("src/state/x.ts", `import "../components/sabacc-table.js"\n`)).toContain("layer-edge")
  })

  it("allows downward edges", () => {
    expect(rules("src/components/x.ts", `import { store } from "../state/store.js"\nimport { html } from "lit"\n`)).toEqual([])
    expect(rules("src/state/x.ts", `import { Effect } from "effect"\nimport type { Game } from "../domain/model.js"\n`)).toEqual([])
  })

  it("keeps Three.js in the scene layer and the scene out of the 2D components", () => {
    expect(rules("src/scene/x.ts", `import * as THREE from "three"\nimport { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js"\nimport "../components/sabacc-controls.ts"\nimport { promptFor } from "../presentation/prompt.ts"\n`)).toEqual([])
    expect(rules("src/components/x.ts", `import * as THREE from "three"\n`)).toContain("layer-package")
    expect(rules("src/components/x.ts", `import "../scene/sabacc-3d.ts"\n`)).toContain("layer-edge")
    expect(rules("src/presentation/x.ts", `import { html } from "lit"\n`)).toContain("layer-package")
    expect(rules("src/presentation/x.ts", `import type { Store } from "../state/store.ts"\n`)).toContain("layer-edge")
    expect(rules("src/components/x.ts", `import { describeEvent } from "../presentation/describe.ts"\n`)).toEqual([])
  })

  it("keeps the server off browser code, and the browser off the server", () => {
    expect(rules("src/server/x.ts", `import { DatabaseSync } from "node:sqlite"\nimport { HttpRouter } from "@effect/platform"\nimport { applyCommand } from "../domain/engine.ts"\nimport { ClientMessage } from "../protocol/messages.ts"\n`)).toEqual([])
    expect(rules("src/server/x.ts", `import { html } from "lit"\n`)).toContain("layer-package")
    expect(rules("src/server/x.ts", `import { createStore } from "../state/store.ts"\n`)).toContain("layer-edge")
    expect(rules("src/state/x.ts", `import { ServerMessage } from "../protocol/messages.ts"\n`)).toEqual([])
    expect(rules("src/components/x.ts", `import "../server/room.ts"\n`)).toContain("layer-edge")
    expect(rules("src/protocol/x.ts", `import { DatabaseSync } from "node:sqlite"\n`)).toContain("layer-package")
    expect(rules("src/server/main.ts", `import { NodeRuntime } from "@effect/platform-node"\nNodeRuntime.runMain(program)\n`)).toEqual([])
    expect(rules("src/server/room.ts", `Effect.runFork(e)\n`)).toContain("single-runtime")
  })

  it("keeps Gyral in the view layers", () => {
    expect(rules("src/components/x.ts", `import { define, html } from "@gyral/core"\nimport { delay } from "@gyral/time"\n`)).toEqual([])
    expect(rules("src/scene/x.ts", `import { defineHook } from "@gyral/core"\n`)).toEqual([])
    for (const layer of ["domain", "protocol", "state", "server", "presentation"])
      expect(rules(`src/${layer}/x.ts`, `import { define } from "@gyral/core"\n`)).toContain("layer-package")
  })

  it("keeps the domain pure", () => {
    expect(rules("src/domain/x.ts", "const r = Math.random()\n")).toContain("domain-no-math-random")
    expect(rules("src/domain/x.ts", "throw new Error('x')\n")).toContain("domain-no-throw")
    expect(rules("src/domain/x.ts", "const f = async () => 1\n")).toContain("domain-no-async")
    expect(rules("src/domain/x.ts", "const n = xs[0]!.value\n")).toContain("domain-no-non-null")
    expect(rules("src/domain/x.ts", "const w = window.innerWidth\n")).toContain("domain-no-dom")
    expect(rules("src/domain/x.ts", `const label = "the call window"\n`)).toEqual([])
    expect(rules("src/domain/x.ts", "class Deck {}\n")).toContain("domain-no-class")
    expect(rules("src/domain/x.ts", `class Oops extends Data.TaggedError("Oops")<{}> {}\n`)).toEqual([])
    expect(rules("src/domain/x.ts", "// throw is fine in a comment\nconst ok = a !== b\n")).toEqual([])
  })

  it("allows Effect.run* only in the store", () => {
    expect(rules("src/components/x.ts", "Effect.runSync(e)\n")).toContain("single-runtime")
    expect(rules("src/state/store.ts", `import { Effect } from "effect"\nEffect.runSync(e)\n`)).toEqual([])
  })

  it("rejects a `then` export (it makes the module look like a promise)", () => {
    expect(rules("src/domain/x.ts", "export const then = (a: number) => a\n")).toContain("no-then-export")
    expect(rules("src/domain/x.ts", "export const followedBy = (a: number) => a\n")).toEqual([])
  })

  it("rejects React files", () => {
    expect(rules("src/components/App.jsx", "")).toEqual(["no-react"])
  })

  it("finds broken doc links and oversize maps", () => {
    const docs = [
      { path: "docs/a.md", text: "[ok](b.md) [bad](missing.md) [web](https://x.dev)" },
      { path: "AGENTS.md", text: "x\n".repeat(200) },
    ]
    const found = checkDocs(docs, (p) => p === "docs/b.md").map((v) => v.rule)
    expect(found).toEqual(["doc-link", "agents-map-size"])
  })
})
