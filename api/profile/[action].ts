import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import {
  getAdminFirestore,
  ok,
  err,
  requireAuth,
  parseBody,
} from '../_lib/admin';
import { generateUniqueCode } from '../../shared/code';

// ── Schemas ───────────────────────────────────────────────────────────────────

const UsernameSchema = z.object({
  username: z
    .string()
    .min(2, 'Username must be at least 2 characters')
    .max(20, 'Username must be at most 20 characters')
    .transform((s) => s.trim()),
});

const FcmTokenSchema = z.object({ token: z.string().min(1) });

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleUsername(
  req: VercelRequest,
  res: VercelResponse,
  uid: string,
) {
  const body = parseBody(res, UsernameSchema, req.body);
  if (!body) return;

  const fs = getAdminFirestore();
  const batch = fs.batch();

  // Update user doc
  batch.update(fs.collection('users').doc(uid), {
    username: body.username,
    onboarded: true,
  });

  // Denormalize username into all connections where this uid is a member
  const connsSnap = await fs
    .collection('connections')
    .where('members', 'array-contains', uid)
    .get();

  for (const connDoc of connsSnap.docs) {
    batch.update(connDoc.ref, {
      [`names.${uid}`]: body.username,
    });
  }

  await batch.commit();
  return ok(res, { username: body.username });
}

async function handleRegenerateCode(
  req: VercelRequest,
  res: VercelResponse,
  uid: string,
) {
  const fs = getAdminFirestore();

  // Get current code
  const userSnap = await fs.collection('users').doc(uid).get();
  if (!userSnap.exists) {
    return err(res, 'User not found.', 404);
  }
  const oldCode = (userSnap.data() as { code: string }).code;

  // Generate and claim new code
  const newCode = await generateUniqueCode(async (raw) => {
    const codeRef = fs.collection('codes').doc(raw);
    try {
      await fs.runTransaction(async (tx) => {
        const snap = await tx.get(codeRef);
        if (snap.exists) throw new Error('EXISTS');
        tx.create(codeRef, {
          uid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      return true;
    } catch (e) {
      if (e instanceof Error && e.message === 'EXISTS') return false;
      throw e;
    }
  });

  // Batched: update user doc + delete old code doc
  const batch = fs.batch();
  batch.update(fs.collection('users').doc(uid), { code: newCode });
  batch.delete(fs.collection('codes').doc(oldCode));
  await batch.commit();

  return ok(res, { code: newCode });
}

async function handleFcmTokenRegister(
  req: VercelRequest,
  res: VercelResponse,
  uid: string,
) {
  const body = parseBody(res, FcmTokenSchema, req.body);
  if (!body) return;

  const fs = getAdminFirestore();
  await fs.collection('users').doc(uid).update({
    fcmTokens: admin.firestore.FieldValue.arrayUnion(body.token),
  });
  return ok(res, {});
}

async function handleFcmTokenRemove(
  req: VercelRequest,
  res: VercelResponse,
  uid: string,
) {
  const body = parseBody(res, FcmTokenSchema, req.body);
  if (!body) return;

  const fs = getAdminFirestore();
  await fs.collection('users').doc(uid).update({
    fcmTokens: admin.firestore.FieldValue.arrayRemove(body.token),
  });
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
      case 'username':
        if (req.method !== 'POST') break;
        return void (await handleUsername(req, res, decoded.uid));

      case 'regenerate-code':
        if (req.method !== 'POST') break;
        return void (await handleRegenerateCode(req, res, decoded.uid));

      case 'fcm-token':
        if (req.method === 'POST') {
          return void (await handleFcmTokenRegister(req, res, decoded.uid));
        }
        if (req.method === 'DELETE') {
          return void (await handleFcmTokenRemove(req, res, decoded.uid));
        }
        break;
    }

    err(res, 'Not found', 404);
  } catch (e) {
    console.error(`[api/profile/${action}]`, e);
    err(res, 'Internal server error', 500, 'INTERNAL');
  }
}
