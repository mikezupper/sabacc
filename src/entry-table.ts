// Provides the table store to the whole page (solo, or the ?room= table). Each entry
// imports this before any component module, so modules evaluate in that order and the
// components' first command already reaches the store (ARCHITECTURE.md "Data flow").
import { provideTable } from "./components/table-driver.ts"
import { bootStore } from "./state/boot.ts"

provideTable(document.body, bootStore(location.search))
