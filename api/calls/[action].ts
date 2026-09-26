import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import {
  getAdminFirestore,
  getAdminDatabase,
  getAdminApp,
  ok,
  err,
  requireAuth,
  parseBody,
} from '../_lib/admin';
import { CallRoom, ConnectionDoc } from '../../shared/types';

// ── Schemas ───────────────────────────────────────────────────────────────────

const InviteSchema = z.object({
  calleeUid: z.string().min(1),
  durationSec: z.number().int().min(60).max(3600),
  video: z.boolean(),
});

const CancelSchema = z.object({ roomId: z.string().min(1) });
const DeclineSchema = z.object({
  roomId: z.string().min(1),
  calleeUid: z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sendFcmDataMessage(
  uid: string,
  data: Record<string, string>,
  ttlSeconds: number,
  priority: 'high' | 'normal' = 'high',
): Promise<void> {
  const fs = getAdminFirestore();
  const userSnap = await fs.collection('users').doc(uid).get();
  if (!userSnap.exists) return;

  const tokens: string[] = (userSnap.data() as { fcmTokens: string[] }).fcmTokens ?? [];
  if (tokens.length === 0) return;

  const messaging = getAdminApp().messaging();
  const results = await messaging.sendEachForMulticast({
    tokens,
    data,
    android: {
      priority: priority as 'high' | 'normal',
      ttl: ttlSeconds * 1000,
    },
  });

  // Prune invalid tokens
  const invalidTokens: string[] = [];
  results.responses.forEach((r, i) => {
    if (!r.success && tokens[i]) {
      const code = r.error?.code ?? '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(tokens[i]!);
      }
    }
  });

  if (invalidTokens.length > 0) {
    await fs.collection('users').doc(uid).update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
    });
  }
}

function generateRoomId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleInvite(
  req: VercelRequest,
  res: VercelResponse,
  callerUid: string,
) {
  const body = parseBody(res, InviteSchema, req.body);
  if (!body) return;

  const { calleeUid, durationSec, video } = body;

  if (calleeUid === callerUid) {
    return err(res, 'Cannot call yourself.', 400, 'SELF_CALL');
  }

  const fs = getAdminFirestore();

  // Verify accepted connection exists between caller and callee
  const [a, b] = [callerUid, calleeUid].sort();
  const connectionId = `${a}_${b}`;
  const connSnap = await fs.collection('connections').doc(connectionId).get();
  if (!connSnap.exists || (connSnap.data() as ConnectionDoc).status !== 'accepted') {
    return err(res, 'Not connected with this user.', 403, 'NOT_CONNECTED');
  }

  const db = getAdminDatabase();
  const [u1, u2] = [callerUid, calleeUid].sort();
  const pairKey = `active_pairs/${u1}_${u2}`;
  const now = Date.now();

  // 1. Check for Glare / Collision on active pair (e.g. both users calling each other)
  const activePairSnap = await db.ref(pairKey).get();
  if (activePairSnap.exists()) {
    const pairData = activePairSnap.val() as { roomId?: string; callerUid?: string; createdAt?: number };
    if (pairData?.roomId) {
      const roomSnap = await db.ref(`calls/${pairData.roomId}`).get();
      if (roomSnap.exists()) {
        const existingRoom = roomSnap.val() as CallRoom;
        const isRecent = pairData.createdAt ? now - pairData.createdAt < 45_000 : false;
        if (
          isRecent &&
          (existingRoom.state === 'ringing' || existingRoom.state === 'active')
        ) {
          // Glare detected: Callee already initiated a call to Caller!
          if (pairData.callerUid === calleeUid) {
            // Both users called each other simultaneously! Join existing call as callee.
            await db.ref(`incoming/${callerUid}`).remove();
            return ok(res, { roomId: pairData.roomId, role: 'callee' });
          }
          // Same user repeated invite
          if (pairData.callerUid === callerUid) {
            return ok(res, { roomId: pairData.roomId, role: 'caller' });
          }
        }
      }
    }
    // Stale pair record, clean up
    await db.ref(pairKey).remove();
  }

  // 2. Check incoming queue of callerUid (if calleeUid is already calling callerUid)
  const callerIncomingSnap = await db.ref(`incoming/${callerUid}`).get();
  if (callerIncomingSnap.exists()) {
    const incomingData = callerIncomingSnap.val() as { roomId?: string; callerUid?: string; ts?: number };
    if (incomingData?.callerUid === calleeUid && incomingData?.roomId) {
      const roomSnap = await db.ref(`calls/${incomingData.roomId}`).get();
      if (roomSnap.exists()) {
        const room = roomSnap.val() as CallRoom;
        if (room.state === 'ringing' || room.state === 'active') {
          await db.ref(`incoming/${callerUid}`).remove();
          return ok(res, { roomId: incomingData.roomId, role: 'callee' });
        }
      }
    }
  }

  // 3. Busy check: look for existing active/ringing room for callee
  const incomingSnap = await db.ref(`incoming/${calleeUid}`).get();
  if (incomingSnap.exists()) {
    const incomingData = incomingSnap.val() as { roomId?: string; ts?: number };
    const isOld = incomingData?.ts ? now - incomingData.ts > 45_000 : false;

    let isStale = isOld;
    if (!isStale && incomingData?.roomId) {
      const roomSnap = await db.ref(`calls/${incomingData.roomId}`).get();
      if (!roomSnap.exists()) {
        isStale = true;
      } else {
        const room = roomSnap.val() as CallRoom;
        if (room.state !== 'ringing' && room.state !== 'active') {
          isStale = true;
        }
      }
    }

    if (isStale) {
      // Clean up orphaned incoming record and allow call to proceed
      await db.ref(`incoming/${calleeUid}`).remove();
    } else {
      return err(res, 'User is already in a call.', 409, 'BUSY');
    }
  }

  // Get usernames
  const [callerSnap, calleeSnap] = await Promise.all([
    fs.collection('users').doc(callerUid).get(),
    fs.collection('users').doc(calleeUid).get(),
  ]);
  const callerName: string = (callerSnap.data() as { username: string })?.username ?? '';
  const calleeName: string = (calleeSnap.data() as { username: string })?.username ?? '';

  const roomId = generateRoomId();

  const room: CallRoom = {
    callerUid,
    calleeUid,
    callerName,
    calleeName,
    video,
    durationSec,
    state: 'ringing',
    createdAt: now,
  };

  // Create RTDB room + incoming + active_pair atomically
  await db.ref().update({
    [`calls/${roomId}`]: room,
    [`incoming/${calleeUid}`]: {
      roomId,
      callerUid,
      callerName,
      video,
      durationSec,
      ts: now,
    },
    [pairKey]: {
      roomId,
      callerUid,
      createdAt: now,
    },
  });

  // FCM data-only message, high priority, 30s TTL
  await sendFcmDataMessage(
    calleeUid,
    {
      type: 'incoming_call',
      roomId,
      calleeUid,
      callerName,
      video: String(video),
      durationSec: String(durationSec),
    },
    30,
    'high',
  );

  return ok(res, { roomId });
}

async function handleCancel(
  req: VercelRequest,
  res: VercelResponse,
  callerUid: string,
) {
  const body = parseBody(res, CancelSchema, req.body);
  if (!body) return;

  const db = getAdminDatabase();
  const roomSnap = await db.ref(`calls/${body.roomId}`).get();

  if (!roomSnap.exists()) {
    return err(res, 'Room not found.', 404);
  }

  const room = roomSnap.val() as CallRoom;
  if (room.callerUid !== callerUid) {
    return err(res, 'Not authorized.', 403);
  }
  if (room.state !== 'ringing') {
    return err(res, 'Call is not ringing.', 400, 'NOT_RINGING');
  }

  const [a1, b1] = [room.callerUid, room.calleeUid].sort();

  // Set cancelled + clear incoming + clear active pair atomically
  await db.ref().update({
    [`calls/${body.roomId}/state`]: 'cancelled',
    [`calls/${body.roomId}/endedAt`]: admin.database.ServerValue.TIMESTAMP,
    [`incoming/${room.calleeUid}`]: null,
    [`active_pairs/${a1}_${b1}`]: null,
  });

  // Notify callee
  await sendFcmDataMessage(
    room.calleeUid,
    { type: 'call_cancel', roomId: body.roomId },
    10,
    'high',
  );

  return ok(res, {});
}

async function handleDecline(
  req: VercelRequest,
  res: VercelResponse,
  authUid?: string,
) {
  const body = parseBody(res, DeclineSchema, req.body);
  if (!body) return;

  const db = getAdminDatabase();
  const roomSnap = await db.ref(`calls/${body.roomId}`).get();

  if (!roomSnap.exists()) {
    return err(res, 'Room not found.', 404);
  }

  const room = roomSnap.val() as CallRoom;
  const calleeUid = authUid || body.calleeUid || room.calleeUid;
  if (authUid && room.calleeUid !== authUid && room.callerUid !== authUid) {
    return err(res, 'Not authorized.', 403);
  }

  const [a1, b1] = [room.callerUid, room.calleeUid].sort();

  // Set declined + clear incoming + clear active pair atomically
  await db.ref().update({
    [`calls/${body.roomId}/state`]: 'declined',
    [`calls/${body.roomId}/endedAt`]: admin.database.ServerValue.TIMESTAMP,
    [`calls/${body.roomId}/endedBy`]: calleeUid,
    [`incoming/${room.calleeUid}`]: null,
    [`active_pairs/${a1}_${b1}`]: null,
  });

  return ok(res, {});
}

async function handleIce(
  _req: VercelRequest,
  res: VercelResponse,
) {
  const meteredDomain = process.env['METERED_DOMAIN'] || (process.env['METERED_APP_NAME'] ? `${process.env['METERED_APP_NAME']}.metered.live` : null);
  const meteredApiKey = process.env['METERED_API_KEY'];

  const turnUrls = process.env['TURN_URLS'];
  const turnUsername = process.env['TURN_USERNAME'];
  const turnCredential = process.env['TURN_CREDENTIAL'];

  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun.nextcloud.com:3478' },
    { urls: 'stun:stun.voip.blackberry.com:3478' },
    { urls: 'stun:stun.miwifi.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ];

  // Option A: Fetch dynamic short-lived TURN credentials from Metered.ca REST API
  if (meteredDomain && meteredApiKey) {
    try {
      const resp = await fetch(`https://${meteredDomain}/api/v1/turn/credentials?apiKey=${meteredApiKey}`);
      if (resp.ok) {
        const dynamicServers = (await resp.json()) as RTCIceServer[];
        if (Array.isArray(dynamicServers)) {
          iceServers.push(...dynamicServers);
        }
      }
    } catch (e) {
      console.warn('[ice] Failed to fetch dynamic Metered credentials:', e);
    }
  }

  // Option B: Static TURN credentials from env vars
  if (turnUrls && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls.split(',').map((u) => u.trim()),
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return ok(res, { iceServers });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const { action } = req.query as { action: string };

  if (action === 'decline' && req.method === 'POST') {
    let uid: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = await getAdminApp().auth().verifyIdToken(authHeader.slice(7));
        uid = decoded.uid;
      } catch {
        // ignore
      }
    }
    return void (await handleDecline(req, res, uid));
  }

  // All other actions require valid authentication
  const decoded = await requireAuth(req, res);
  if (!decoded) return;

  try {
    switch (action) {
      case 'invite':
        if (req.method !== 'POST') break;
        return void (await handleInvite(req, res, decoded.uid));

      case 'cancel':
        if (req.method !== 'POST') break;
        return void (await handleCancel(req, res, decoded.uid));

      case 'ice':
        if (req.method !== 'GET') break;
        return void (await handleIce(req, res));
    }

    err(res, 'Not found', 404);
  } catch (e) {
    console.error(`[api/calls/${action}]`, e);
    err(res, 'Internal server error', 500, 'INTERNAL');
  }
}
