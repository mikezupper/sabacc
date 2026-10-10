// The table driver inside a real Gyral component: provided by an ancestor, watched from
// subscriptions, moves sent from an intent, the store's change rendered back.
import { define, html, settled } from "@gyral/core"
import { collectErrors } from "@gyral/testing"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Command } from "../../src/domain/model.ts"
import { play, provideTable, watchTable, type TableSnapshot } from "../../src/components/table-driver.ts"
import { createStore } from "../../src/state/store.ts"

interface State {
  readonly phase: string
  readonly beats: number
}
type Msg = { readonly _tag: "TableChanged"; readonly table: TableSnapshot } | { readonly _tag: "Deal" }

const Probe = define<State, Msg>()("test-table-probe", {
  init: () => ({ phase: "", beats: 0 }),
  subscriptions: () => [watchTable((table): Msg => ({ _tag: "TableChanged", table }))],
  intent: { Deal: true },
  update: {
    TableChanged: (_s, m) => ({ phase: m.table.game.phase._tag, beats: m.table.last.length }),
    Deal: (s) => [s, [play(Command.StartHand())]],
  },
  view: (s, i) => html`<output>${s.phase}</output> <button type="button" data-intent=${i.Deal}>Deal</button>`,
})

afterEach(() => document.body.replaceChildren())

describe("table driver in a Gyral component", () => {
  it("shows the store's table and sends moves to it", async () => {
    const store = createStore(42)
    const host = document.createElement("div")
    provideTable(host, store)
    const probe = new Probe()
    host.append(probe)
    document.body.append(host)
    await settled()
    await vi.waitFor(() => expect(probe.shadowRoot?.querySelector("output")?.textContent).toBe("Lobby"))

    probe.shadowRoot?.querySelector("button")?.click()
    await vi.waitFor(() => expect(probe.shadowRoot?.querySelector("output")?.textContent).toBe("Playing"))
    expect(store.game.get().phase._tag).toBe("Playing")
  })

  it("follows changes made elsewhere (another view, or the server)", async () => {
    const store = createStore(7)
    const host = document.createElement("div")
    provideTable(host, store)
    const probe = new Probe()
    host.append(probe)
    document.body.append(host)
    await settled()
    store.dispatch(Command.StartHand())
    await vi.waitFor(() => expect(probe.shadowRoot?.querySelector("output")?.textContent).toBe("Playing"))
  })

  it("reports a clear error through Gyral's error channel when no table is provided", async () => {
    const collected = collectErrors()
    try {
      const probe = new Probe()
      document.body.append(probe)
      await settled()
      await vi.waitFor(() => expect(collected.errors.length).toBeGreaterThan(0))
      const [failure] = collected.errors
      expect(failure?.component).toBe("test-table-probe")
      expect(failure?.phase).toBe("command")
      // Development expands the diagnostic; optimized/production core includes its code.
      expect(failure?.message).toMatch(/G0043|no driver provides/)
      expect(failure?.message).toContain("table-watch")
      expect(failure?.message).toMatch(/provideDrivers|https:\/\/gyral.dev\/errors\/#G0043/)
    } finally {
      collected.stop()
    }
  })
})
