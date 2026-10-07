// App wiring for the classic page: the only module allowed to touch everything
// (ARCHITECTURE.md). Import order matters: the store first, then the components.
import "./entry-table.ts"
import "./components/sabacc-table.ts"
