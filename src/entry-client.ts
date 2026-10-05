// App wiring for the 2D page: the only module allowed to touch everything (ARCHITECTURE.md).
import "./components/sabacc-table.ts"
import { bootStore } from "./state/boot.ts"

const table = document.querySelector("sabacc-table")
if (table !== null) table.store = bootStore(location.search)
