import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { z } from 'zod';

// ── Lazy singleton firebase-admin ─────────────────────────────────────────────

let adminInitialized = false;

export function getAdminApp(): admin.app.App {
  if (adminInitialized) {
    return admin.app();
  }

  let credential: admin.credential.Credential;

  if (process.env['FIREBASE_SERVICE_ACCOUNT']) {
    // Full JSON service account in one env var
    const sa = JSON.parse(process.env['FIREBASE_SERVICE_ACCOUNT']) as admin.ServiceAccount;
    credential = admin.credential.cert(sa);
  } else {
    // Split env vars — handle \n in private key
    const privateKey = (process.env['FIREBASE_PRIVATE_KEY'] ?? '').replace(
      /\\n/g,
      '\n',
    );
    credential = admin.credential.cert({
      projectId: process.env['FIREBASE_PROJECT_ID']!,
      clientEmail: process.env['FIREBASE_CLIENT_EMAIL']!,
      privateKey,
    });
  }

  let databaseURL = process.env['FIREBASE_DATABASE_URL'] || 'https://calldr-default-rtdb.asia-southeast1.firebasedatabase.app';
  if (databaseURL.includes('firebaseio.com') && !databaseURL.includes('asia-southeast1')) {
    databaseURL = 'https://calldr-default-rtdb.asia-southeast1.firebasedatabase.app';
  }

  admin.initializeApp({
    credential,
    databaseURL,
  });

  adminInitialized = true;
  return admin.app();
}

export function getAdminAuth() {
  return getAdminApp().auth();
}

export function getAdminFirestore() {
  return getAdminApp().firestore();
}

export function getAdminDatabase() {
  return getAdminApp().database();
}

// ── Uniform JSON response helpers ─────────────────────────────────────────────

export function ok<T>(res: VercelResponse, data: T, status = 200): void {
  res.status(status).json({ ok: true, data });
}

export function err(
  res: VercelResponse,
  message: string,
  status = 400,
  code?: string,
): void {
  res.status(status).json({ ok: false, error: message, code });
}

// ── Auth middleware ───────────────────────────────────────────────────────────

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
): Promise<admin.auth.DecodedIdToken | null> {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    err(res, 'Unauthorized', 401, 'UNAUTHORIZED');
    return null;
  }
  const idToken = header.slice(7);
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return decoded;
  } catch {
    err(res, 'Invalid token', 401, 'INVALID_TOKEN');
    return null;
  }
}

// ── Zod helpers ───────────────────────────────────────────────────────────────

export function parseBody<T>(
  res: VercelResponse,
  schema: z.ZodSchema<T>,
  body: unknown,
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    err(res, result.error.issues.map((i) => i.message).join(', '), 400, 'VALIDATION_ERROR');
    return null;
  }
  return result.data;
}

// ── Rate limiting (simple in-memory, single serverless instance) ──────────────
// For production use Vercel KV or Redis.

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }
  if (entry.count >= maxRequests) return false; // rate limited
  entry.count++;
  return true;
}
