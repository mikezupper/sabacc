// A multiplayer table: the same Store the views already read, fed by the server over a
// WebSocket instead of by a local engine. The server sends only what this player may
// see, already rotated so they are seat 0. Commands go up; transitions come down and
// play back exactly like solo play. Messages are decoded with the protocol's schemas.
import { Either, Option, Schema } from "effect"
import type { Beat, Command, Game, GameError, GameEvent } from "../domain/model.ts"
import { newTable } from "../domain/table.ts"
import { asEvent, ClientMessageJson, ServerMessageJson, toGameError, type ClientMessage, type ServerMessage } from "../protocol/messages.ts"
import type { KeyValueStore } from "./persistence.ts"
import { signal, type Connection, type Presence, type RoomState, type Store } from "./store.ts"

export const NAME_KEY = "sabacc:name"
const tokenKey = (room: string) => `sabacc:room:${room}`

/** The browser side of a socket; tests pass a fake. */
export interface SocketLike {
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((e: { data: unknown }) => void) | null
  onclose: (() => void) | null
}

export interface RemoteOptions {
  readonly room: string
  readonly storage: Option.Option<KeyValueStore>
  /** Open a socket to the server (default: `/ws` on this page's host). */
  readonly connect?: () => SocketLike
  /** Wait before reconnecting, by attempt (default: 1 s, 2 s, 4 s … up to 10 s). */
  readonly backoff?: (attempt: number) => number
}

const defaultConnect = (): SocketLike => {
  const scheme = location.protocol === "https:" ? "wss" : "ws"
  return new WebSocket(`${scheme}://${location.host}/ws`) as unknown as SocketLike
}

const read = (s: Option.Option<KeyValueStore>, key: string): string | undefined => {
  try {
    return Option.isSome(s) ? (s.value.getItem(key) ?? undefined) : undefined
  } catch {
    return undefined
  }
}

const write = (s: Option.Option<KeyValueStore>, key: string, value: string): void => {
  try {
    if (Option.isSome(s)) s.value.setItem(key, value)
  } catch {
    // Private browsing may refuse; the name and seat just aren't remembered.
  }
}

const toPresence = (p: Extract<ServerMessage, { _tag: "Update" }>["presence"]): Presence => ({
  connected: p.connected,
  deadline: Option.getOrUndefined(Option.map(p.deadline, (d) => ({ seat: d.seat, at: Date.now() + d.remainingMs }))),
})

export const createRemoteStore = (options: RemoteOptions): Store => {
  const { room: code, storage } = options
  const connect = options.connect ?? defaultConnect
  const backoff = options.backoff ?? ((n: number) => Math.min(10_000, 1000 * 2 ** n))
  const savedName = read(storage, NAME_KEY) ?? ""

  const game = signal<Game>(newTable())
  const log = signal<ReadonlyArray<GameEvent>>([])
  const last = signal<ReadonlyArray<Beat>>([])
  const notice = signal<Option.Option<GameError>>(Option.none())
  const room: RoomState = {
    code,
    connection: signal<Connection>(savedName === "" ? "naming" : "connecting"),
    spectator: signal(false),
    host: signal(false),
    presence: signal<Presence>({ connected: [], deadline: undefined }),
    problem: signal<string | undefined>(undefined),
    name: signal(savedName),
    join: (name) => {
      const trimmed = name.trim().slice(0, 24)
      if (trimmed === "") return
      room.name.set(trimmed)
      write(storage, NAME_KEY, trimmed)
      if (room.connection.get() === "naming") open()
    },
  }

  let socket: SocketLike | undefined
  let attempt = 0

  const send = (m: ClientMessage): boolean => {
    const text = Schema.encodeEither(ClientMessageJson)(m)
    if (socket === undefined || room.connection.get() !== "open" || Either.isLeft(text)) return false
    socket.send(text.right)
    return true
  }

  const receive = (m: ServerMessage): void => {
    switch (m._tag) {
      case "Welcome":
        write(storage, tokenKey(code), m.token)
        room.spectator.set(m.spectator)
        room.host.set(m.host)
        room.problem.set(undefined)
        attempt = 0
        return
      case "Snapshot":
        game.set(m.game as Game)
        log.set(m.log.map(asEvent))
        last.set([])
        room.presence.set(toPresence(m.presence))
        return
      case "Update":
        game.set(m.game as Game)
        last.set(m.beats.map((b) => ({ event: asEvent(b.event), game: b.game as Game })))
        log.set([...log.get(), ...m.beats.map((b) => asEvent(b.event))])
        notice.set(Option.none())
        room.presence.set(toPresence(m.presence))
        return
      case "PresenceChanged":
        room.presence.set(toPresence(m.presence))
        return
      case "Rejected":
        notice.set(Option.some(toGameError(m.error)))
        return
      case "Problem":
        room.problem.set(m.message)
        if (m.reason === "no-such-room") {
          room.connection.set("gone")
          socket?.close()
        }
        return
      case "Heartbeat":
        return
    }
  }

  const open = (): void => {
    room.connection.set(attempt === 0 ? "connecting" : "reconnecting")
    const s = connect()
    socket = s
    s.onopen = () => {
      room.connection.set("open")
      const token = read(storage, tokenKey(code))
      send({ _tag: "Join", room: code, name: room.name.get(), ...(token === undefined ? {} : { token }) })
    }
    s.onmessage = (e) => {
      const decoded = Schema.decodeUnknownEither(ServerMessageJson)(String(e.data))
      if (Either.isRight(decoded)) receive(decoded.right)
    }
    s.onclose = () => {
      if (socket !== s || room.connection.get() === "gone") return
      room.connection.set("reconnecting")
      setTimeout(open, backoff(attempt++))
    }
  }

  const dispatch = (command: Command): void => {
    if (command._tag === "Control") return
    // Commands are plain tagged data; the schema checks the shape before it's sent.
    const plain = JSON.parse(JSON.stringify(command)) as unknown
    const decoded = Schema.decodeUnknownEither(ClientMessageJson)(JSON.stringify({ _tag: "Act", command: plain }))
    if (Either.isLeft(decoded) || !send(decoded.right)) room.problem.set("Not connected to the table. Reconnecting…")
  }

  if (savedName !== "") open()

  return { seed: 0, game, log, last, notice, dispatch, restored: false, persistent: true, room }
}
