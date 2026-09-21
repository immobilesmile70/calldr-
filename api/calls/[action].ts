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

  // Busy check: look for existing active/ringing room for callee
  const incomingSnap = await db.ref(`incoming/${calleeUid}`).get();
  if (incomingSnap.exists()) {
    return err(res, 'User is already in a call.', 409, 'BUSY');
  }

  // Get usernames
  const [callerSnap, calleeSnap] = await Promise.all([
    fs.collection('users').doc(callerUid).get(),
    fs.collection('users').doc(calleeUid).get(),
  ]);
  const callerName: string = (callerSnap.data() as { username: string })?.username ?? '';
  const calleeName: string = (calleeSnap.data() as { username: string })?.username ?? '';

  const roomId = generateRoomId();
  const now = Date.now();

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

  // Create RTDB room + incoming atomically
  await db.ref().update({
    [`calls/${roomId}`]: room,
    [`incoming/${calleeUid}`]: {
      roomId,
      callerName,
      video,
      durationSec,
      ts: now,
    },
  });

  // FCM data-only message, high priority, 30s TTL
  await sendFcmDataMessage(
    calleeUid,
    {
      type: 'incoming_call',
      roomId,
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

  // Set cancelled + clear incoming
  await db.ref().update({
    [`calls/${body.roomId}/state`]: 'cancelled',
    [`calls/${body.roomId}/endedAt`]: admin.database.ServerValue.TIMESTAMP,
    [`incoming/${room.calleeUid}`]: null,
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

async function handleIce(
  _req: VercelRequest,
  res: VercelResponse,
) {
  const turnUrls = process.env['TURN_URLS'];
  const turnUsername = process.env['TURN_USERNAME'];
  const turnCredential = process.env['TURN_CREDENTIAL'];

  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  if (turnUrls && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls.split(',').map((u) => u.trim()),
      username: turnUsername,
      credential: turnCredential,
    });
  } else {
    console.warn('[ice] TURN credentials not configured — calls on strict NATs may fail.');
  }

  return ok(res, { iceServers });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const { action } = req.query as { action: string };

  // ICE is auth-required but read-only
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
