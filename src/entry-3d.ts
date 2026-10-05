// App wiring for the 3D page (3d.html): same store and saved table as the 2D page,
// drawn by the Three.js scene (ARCHITECTURE.md).
import "./scene/sabacc-3d.ts"
import { bootStore } from "./state/boot.ts"

const table = document.querySelector("sabacc-3d")
if (table !== null) table.store = bootStore(location.search)
