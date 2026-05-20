import { joinRoom, selfId } from '@trystero-p2p/nostr'
import type { NetMessage } from '../types'

// Trystero room reference (opaque type)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let room: any = null
let sendMessage: ((msg: unknown, targetId?: string) => void) | null = null
let onMessageCallback: ((msg: NetMessage, peerId: string) => void) | null = null
let onJoinCallback: ((peerId: string) => void) | null = null
let onLeaveCallback: ((peerId: string) => void) | null = null

const APP_ID = 'jeopardy-friends-v1'

export function createRoom(code: string) {
  room = joinRoom({ appId: APP_ID }, code)
  _setupRoom()
  return room
}

export function joinGameRoom(code: string) {
  room = joinRoom({ appId: APP_ID }, code)
  _setupRoom()
  return room
}

function _setupRoom() {
  if (!room) return

  const [send, receive] = room.makeAction('msg')
  sendMessage = send

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  receive((msg: any, peerId: string) => {
    onMessageCallback?.(msg as NetMessage, peerId)
  })

  room.onPeerJoin((peerId: string) => {
    onJoinCallback?.(peerId)
  })

  room.onPeerLeave((peerId: string) => {
    onLeaveCallback?.(peerId)
  })
}

export function send(msg: NetMessage, targetPeerId?: string) {
  if (!sendMessage) return
  if (targetPeerId) {
    sendMessage(msg, targetPeerId)
  } else {
    sendMessage(msg)
  }
}

export function broadcast(msg: NetMessage) {
  send(msg)
}

export function onMessage(cb: (msg: NetMessage, peerId: string) => void) {
  onMessageCallback = cb
}

export function onPeerJoin(cb: (peerId: string) => void) {
  onJoinCallback = cb
}

export function onPeerLeave(cb: (peerId: string) => void) {
  onLeaveCallback = cb
}

export function getSelfId(): string {
  return selfId
}

export function leaveRoom() {
  room?.leave()
  room = null
  sendMessage = null
  onMessageCallback = null
  onJoinCallback = null
  onLeaveCallback = null
}
