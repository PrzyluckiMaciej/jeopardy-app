import { joinRoom, selfId } from '@trystero-p2p/nostr'
import type { NetMessage } from '../types'

export interface MediaMetadata {
  mediaId: string
  mimeType: string
}

type MediaReceiveCallback = (
  data: ArrayBuffer,
  peerId: string,
  metadata: MediaMetadata,
) => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let room: any = null
let sendMessage: ((msg: unknown, targetId?: string) => void) | null = null
let sendMediaFn: ((
  data: Blob,
  targetPeers?: string | null,
  metadata?: MediaMetadata,
) => void) | null = null
let onMessageCallback: ((msg: NetMessage, peerId: string) => void) | null = null
let onMediaCallback: MediaReceiveCallback | null = null
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

  const [sendBin, receiveBin] = room.makeAction('media')
  sendMediaFn = sendBin

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  receiveBin((data: any, peerId: string, metadata: any) => {
    onMediaCallback?.(data as ArrayBuffer, peerId, metadata as MediaMetadata)
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

export function sendMedia(
  blob: Blob,
  targetPeerId: string | null,
  metadata: MediaMetadata,
) {
  if (!sendMediaFn) return
  sendMediaFn(blob, targetPeerId, metadata)
}

export function broadcastMedia(blob: Blob, metadata: MediaMetadata) {
  sendMedia(blob, null, metadata)
}

export function onMessage(cb: (msg: NetMessage, peerId: string) => void) {
  onMessageCallback = cb
}

export function onMedia(cb: MediaReceiveCallback) {
  onMediaCallback = cb
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

/** Trystero peer IDs with an active WebRTC connection to this client. */
export function getConnectedPeerIds(): string[] {
  if (!room?.getPeers) return []
  return Object.keys(room.getPeers())
}

export function leaveRoom() {
  room?.leave()
  room = null
  sendMessage = null
  sendMediaFn = null
  onMessageCallback = null
  onMediaCallback = null
  onJoinCallback = null
  onLeaveCallback = null
}
