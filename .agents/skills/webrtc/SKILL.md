---
name: webrtc
description: Use this skill whenever building or debugging WebRTC applications — peer-to-peer audio/video calls, screen sharing, data channels, or signaling servers. Covers RTCPeerConnection setup, offer/answer/ICE exchange, STUN/TURN configuration, media stream handling, data channels, and common connection-failure debugging. Trigger on mentions of WebRTC, RTCPeerConnection, getUserMedia, ICE candidates, STUN/TURN, or peer-to-peer video/audio/data.
license: Proprietary. LICENSE.txt has complete terms
---

# WebRTC Guide

## Overview

WebRTC connects two peers directly (or via TURN relay) for audio, video, and data. Three pieces: media capture (`getUserMedia`), peer connection (`RTCPeerConnection`), and signaling (out-of-band, not part of WebRTC — you provide it via WebSocket, HTTP, etc.).

## Core Flow

```
1. Both peers create RTCPeerConnection
2. Caller: createOffer -> setLocalDescription -> send offer via signaling
3. Callee: setRemoteDescription(offer) -> createAnswer -> setLocalDescription -> send answer via signaling
4. Caller: setRemoteDescription(answer)
5. Both: exchange ICE candidates via signaling as they're generated
6. Connection established -> ontrack / ondatachannel fire
```

## Minimal Setup

```javascript
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:turn.example.com:3478', username: 'user', credential: 'pass' }
  ]
});

pc.onicecandidate = (e) => {
  if (e.candidate) signalingSend({ type: 'ice-candidate', candidate: e.candidate });
};

pc.ontrack = (e) => { remoteVideo.srcObject = e.streams[0]; };

pc.onconnectionstatechange = () => console.log(pc.connectionState);
```

### Caller side
```javascript
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
stream.getTracks().forEach(track => pc.addTrack(track, stream));

const offer = await pc.createOffer();
await pc.setLocalDescription(offer);
signalingSend({ type: 'offer', sdp: offer });
```

### Callee side
```javascript
signalingOnMessage(async (msg) => {
  if (msg.type === 'offer') {
    await pc.setRemoteDescription(msg.sdp);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    signalingSend({ type: 'answer', sdp: answer });
  } else if (msg.type === 'answer') {
    await pc.setRemoteDescription(msg.sdp);
  } else if (msg.type === 'ice-candidate') {
    await pc.addIceCandidate(msg.candidate);
  }
});
```

## ICE Candidate Buffering

`addIceCandidate` fails if `setRemoteDescription` hasn't run yet. Buffer early candidates:

```javascript
let remoteDescSet = false;
const candidateQueue = [];

async function handleCandidate(candidate) {
  if (remoteDescSet) {
    await pc.addIceCandidate(candidate);
  } else {
    candidateQueue.push(candidate);
  }
}

async function setRemoteDesc(desc) {
  await pc.setRemoteDescription(desc);
  remoteDescSet = true;
  while (candidateQueue.length) {
    await pc.addIceCandidate(candidateQueue.shift());
  }
}
```

## Perfect Negotiation (handles glare — both sides offering simultaneously)

```javascript
const polite = /* true for one peer, false for the other — agree out of band */;
let makingOffer = false;
let ignoreOffer = false;

pc.onnegotiationneeded = async () => {
  try {
    makingOffer = true;
    await pc.setLocalDescription();
    signalingSend({ type: 'offer', sdp: pc.localDescription });
  } finally {
    makingOffer = false;
  }
};

signalingOnMessage(async ({ type, sdp, candidate }) => {
  if (type === 'offer' || type === 'answer') {
    const offerCollision = type === 'offer' && (makingOffer || pc.signalingState !== 'stable');
    ignoreOffer = !polite && offerCollision;
    if (ignoreOffer) return;
    await pc.setRemoteDescription(sdp);
    if (type === 'offer') {
      await pc.setLocalDescription();
      signalingSend({ type: 'answer', sdp: pc.localDescription });
    }
  } else if (type === 'ice-candidate') {
    try {
      await pc.addIceCandidate(candidate);
    } catch (e) {
      if (!ignoreOffer) throw e;
    }
  }
});
```

## Data Channels

```javascript
// Initiator
const channel = pc.createDataChannel('chat', { ordered: true });
channel.onopen = () => channel.send('hello');
channel.onmessage = (e) => console.log(e.data);

// Other side
pc.ondatachannel = (e) => {
  e.channel.onmessage = (msg) => console.log(msg.data);
};
```

For unreliable/unordered (game state, real-time): `{ ordered: false, maxRetransmits: 0 }`.

## STUN / TURN

- STUN: discovers public IP/port for direct connection. Free, e.g. `stun:stun.l.google.com:19302`. Fails behind symmetric NAT.
- TURN: relays traffic when direct connection is impossible (~10-20% of real-world connections need it). Requires a TURN server (coturn is the standard self-hosted option) — not free to run at scale.
- Always configure both. TURN entries need `username`/`credential`; use short-lived credentials (HMAC-based) in production, not static ones.

```javascript
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:turn.example.com:3478', username, credential },
  { urls: 'turns:turn.example.com:5349', username, credential } // TURN over TLS, for restrictive firewalls
]
```

## Renegotiation (adding/removing tracks, screen share mid-call)

Adding a track after the initial connection triggers `onnegotiationneeded` automatically — just call `addTrack`/`removeTrack` and let the negotiation handler (above) fire.

```javascript
const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
const sender = pc.getSenders().find(s => s.track.kind === 'video');
await sender.replaceTrack(screenStream.getVideoTracks()[0]); // swap without renegotiation
```

`replaceTrack` avoids a full renegotiation round-trip when swapping media on an existing sender — prefer it over remove+add for camera/screen-share toggling.

## Connection State Debugging

Check `pc.connectionState` / `pc.iceConnectionState`, not just success/failure of individual calls:

| State | Meaning |
|---|---|
| `new` | Initial |
| `connecting` | ICE checks in progress |
| `connected` | At least one working candidate pair |
| `disconnected` | Transient loss — may self-recover |
| `failed` | No usable candidate pair — need TURN or network fix |
| `closed` | `pc.close()` was called |

```javascript
pc.oniceconnectionstatechange = () => {
  if (pc.iceConnectionState === 'failed') {
    pc.restartIce(); // trigger new ICE gathering, e.g. after network change
  }
};
```

## Common Pitfalls

- **No TURN server**: works on same-network testing, fails for real users behind NAT/firewall. Always test across networks (e.g. mobile hotspot vs wifi) before assuming it works.
- **Ignoring ICE candidate order**: candidates trickle in after the offer/answer — don't assume they arrive together. Use the buffering pattern above.
- **Not handling `onnegotiationneeded` for renegotiation**: adding tracks later without listening for this event leaves the new track undelivered.
- **Glare on simultaneous offers**: without perfect negotiation, two peers offering at once corrupts signaling state. Use the polite/impolite pattern above for any scenario where either side can initiate.
- **getUserMedia over HTTP**: browsers require HTTPS (or `localhost`) for camera/mic access.
- **Autoplay blocked**: remote `<video>` needs `muted` set or a user gesture before `play()` succeeds in most browsers.
- **Closing without cleanup**: call `pc.close()` and stop all local tracks (`track.stop()`) on hangup, or devices stay held.

## Quick Reference

| Task | API |
|---|---|
| Get camera/mic | `navigator.mediaDevices.getUserMedia()` |
| Get screen | `navigator.mediaDevices.getDisplayMedia()` |
| Create connection | `new RTCPeerConnection(config)` |
| Add media | `pc.addTrack(track, stream)` |
| Swap media without renegotiation | `sender.replaceTrack(newTrack)` |
| Create offer/answer | `pc.createOffer()` / `pc.createAnswer()` |
| Apply SDP | `pc.setLocalDescription()` / `pc.setRemoteDescription()` |
| Add ICE candidate | `pc.addIceCandidate(candidate)` |
| Data channel | `pc.createDataChannel(label, opts)` / `pc.ondatachannel` |
| Force ICE restart | `pc.restartIce()` |
| Tear down | `pc.close()` + `track.stop()` on all local tracks |
