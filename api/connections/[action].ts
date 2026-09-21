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
  checkRateLimit,
} from '../_lib/admin';
import { normalizeCode } from '../../shared/code';
import { ConnectionDoc } from '../../shared/types';

// ── Schemas ───────────────────────────────────────────────────────────────────

const RequestSchema = z.object({ code: z.string().min(1) });
const RespondSchema = z.object({
  connectionId: z.string().min(1),
  action: z.enum(['accept', 'decline']),
});
const RemoveSchema = z.object({ connectionId: z.string().min(1) });

// ── Helpers ───────────────────────────────────────────────────────────────────

function sortedConnectionId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

async function sendFcmToUser(
  uid: string,
  data: Record<string, string>,
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
    android: { priority: 'high' },
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

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleRequest(
  req: VercelRequest,
  res: VercelResponse,
  uid: string,
) {
  // Rate limit: 20 requests per hour per user
  if (!checkRateLimit(`conn-request:${uid}`, 20, 60 * 60 * 1000)) {
    return err(res, 'Too many requests. Try again later.', 429, 'RATE_LIMITED');
  }

  const body = parseBody(res, RequestSchema, req.body);
  if (!body) return;

  const raw = normalizeCode(body.code);
  if (!raw) {
    return err(res, 'Invalid code format.', 400, 'INVALID_CODE');
  }

  const fs = getAdminFirestore();

  // Lookup code → uid
  const codeSnap = await fs.collection('codes').doc(raw).get();
  if (!codeSnap.exists) {
    return err(res, 'No user with that code.', 404, 'CODE_NOT_FOUND');
  }
  const targetUid: string = (codeSnap.data() as { uid: string }).uid;

  if (targetUid === uid) {
    return err(res, 'You cannot add yourself.', 400, 'SELF_REQUEST');
  }

  const connectionId = sortedConnectionId(uid, targetUid);
  const connRef = fs.collection('connections').doc(connectionId);

  // Check existing connection
  const connSnap = await connRef.get();
  if (connSnap.exists) {
    const conn = connSnap.data() as ConnectionDoc;
    if (conn.status === 'accepted') {
      return err(res, 'Already connected.', 409, 'ALREADY_CONNECTED');
    }
    if (conn.requester === uid) {
      return err(res, 'Request already sent.', 409, 'ALREADY_PENDING');
    }
    // Pending from them → auto-accept
    await connRef.update({
      status: 'accepted',
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Notify the original requester
    sendFcmToUser(targetUid, { type: 'request_accepted', connectionId }).catch(() => {});
    return ok(res, { connectionId, autoAccepted: true });
  }

  // Get usernames for denormalization
  const [senderSnap, targetSnap] = await Promise.all([
    fs.collection('users').doc(uid).get(),
    fs.collection('users').doc(targetUid).get(),
  ]);
  const senderName: string = (senderSnap.data() as { username: string })?.username ?? '';
  const targetName: string = (targetSnap.data() as { username: string })?.username ?? '';

  await connRef.set({
    members: [uid, targetUid].sort(),
    names: { [uid]: senderName, [targetUid]: targetName },
    status: 'pending',
    requester: uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Notify target
  sendFcmToUser(targetUid, {
    type: 'connection_request',
    connectionId,
    fromName: senderName,
  }).catch(() => {});

  return ok(res, { connectionId }, 201);
}

async function handleRespond(
  req: VercelRequest,
  res: VercelResponse,
  uid: string,
) {
  const body = parseBody(res, RespondSchema, req.body);
  if (!body) return;

  const fs = getAdminFirestore();
  const connRef = fs.collection('connections').doc(body.connectionId);
  const connSnap = await connRef.get();

  if (!connSnap.exists) {
    return err(res, 'Connection not found.', 404);
  }
  const conn = connSnap.data() as ConnectionDoc;

  if (!conn.members.includes(uid)) {
    return err(res, 'Not authorized.', 403);
  }
  if (conn.requester === uid) {
    return err(res, 'You cannot respond to your own request.', 400, 'OWN_REQUEST');
  }

  if (body.action === 'accept') {
    await connRef.update({
      status: 'accepted',
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // Notify requester
    sendFcmToUser(conn.requester, {
      type: 'request_accepted',
      connectionId: body.connectionId,
    }).catch(() => {});
    return ok(res, { accepted: true });
  } else {
    await connRef.delete();
    return ok(res, { declined: true });
  }
}

async function handleRemove(
  req: VercelRequest,
  res: VercelResponse,
  uid: string,
) {
  const body = parseBody(res, RemoveSchema, req.body);
  if (!body) return;

  const fs = getAdminFirestore();
  const connRef = fs.collection('connections').doc(body.connectionId);
  const connSnap = await connRef.get();

  if (!connSnap.exists) {
    return err(res, 'Connection not found.', 404);
  }
  const conn = connSnap.data() as ConnectionDoc;
  if (!conn.members.includes(uid)) {
    return err(res, 'Not authorized.', 403);
  }

  await connRef.delete();
  return ok(res, {});
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const { action } = req.query as { action: string };

  const decoded = await requireAuth(req, res);
  if (!decoded) return;

  try {
    switch (action) {
      case 'request':
        if (req.method !== 'POST') break;
        return void (await handleRequest(req, res, decoded.uid));

      case 'respond':
        if (req.method !== 'POST') break;
        return void (await handleRespond(req, res, decoded.uid));

      case 'remove':
        if (req.method !== 'POST') break;
        return void (await handleRemove(req, res, decoded.uid));
    }

    err(res, 'Not found', 404);
  } catch (e) {
    console.error(`[api/connections/${action}]`, e);
    err(res, 'Internal server error', 500, 'INTERNAL');
  }
}
