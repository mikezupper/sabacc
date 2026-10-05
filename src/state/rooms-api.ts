// Asking the server for a new multiplayer table.

export type NewRoom = { readonly room: string } | { readonly error: string }

/** POST /api/rooms. Without a game server (e.g. a static host) this reports why. */
export const createRoom = async (): Promise<NewRoom> => {
  try {
    const res = await fetch("/api/rooms", { method: "POST" })
    const body = (await res.json()) as { room?: unknown; error?: unknown }
    if (res.ok && typeof body.room === "string") return { room: body.room }
    return { error: typeof body.error === "string" ? body.error : "The server couldn't open a table." }
  } catch {
    return { error: "Multiplayer needs the game server, and it can't be reached." }
  }
}
