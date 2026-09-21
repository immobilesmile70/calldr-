import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import {
  getAdminAuth,
  getAdminFirestore,
  ok,
  err,
  parseBody,
  getAdminApp,
} from '../_lib/admin';
import { generateUniqueCode } from '../../shared/code';

// ── Schemas ───────────────────────────────────────────────────────────────────

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const ForgotSchema = z.object({
  email: z.string().email(),
});

const GoogleSchema = z.object({
  idToken: z.string().min(1),
});

// ── Code generation helper ────────────────────────────────────────────────────

async function createUniqueCode(
  uid: string,
): Promise<string> {
  const fs = getAdminFirestore();

  const rawCode = await generateUniqueCode(async (raw) => {
    const codeRef = fs.collection('codes').doc(raw);
    try {
      await fs.runTransaction(async (tx) => {
        const snap = await tx.get(codeRef);
        if (snap.exists) {
          throw new Error('EXISTS');
        }
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

  return rawCode;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleSignup(req: VercelRequest, res: VercelResponse) {
  const body = parseBody(res, SignupSchema, req.body);
  if (!body) return;

  const { email, password } = body;

  let uid: string;
  try {
    const user = await getAdminAuth().createUser({ email, password });
    uid = user.uid;
  } catch (e) {
    if ((e as { code?: string }).code === 'auth/email-already-exists') {
      return err(res, 'An account with this email already exists.', 409, 'EMAIL_EXISTS');
    }
    throw e;
  }

  let code: string;
  try {
    code = await createUniqueCode(uid);
  } catch {
    // Rollback: delete the auth user
    await getAdminAuth().deleteUser(uid).catch(() => {});
    return err(res, 'Failed to create account. Please try again.', 500, 'CODE_FAIL');
  }

  const fs = getAdminFirestore();
  await fs.collection('users').doc(uid).set({
    username: '',
    email,
    code,
    onboarded: false,
    fcmTokens: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const customToken = await getAdminAuth().createCustomToken(uid);
  return ok(res, { customToken }, 201);
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  const body = parseBody(res, LoginSchema, req.body);
  if (!body) return;

  const { email, password } = body;
  const apiKey = process.env['FIREBASE_WEB_API_KEY'];

  const resp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: false }),
    },
  );

  if (!resp.ok) {
    const data = await resp.json() as { error?: { message?: string } };
    const msg = data?.error?.message ?? 'Login failed';
    if (msg.includes('EMAIL_NOT_FOUND') || msg.includes('INVALID_PASSWORD') || msg.includes('INVALID_LOGIN_CREDENTIALS')) {
      return err(res, 'Incorrect email or password.', 401, 'BAD_CREDENTIALS');
    }
    return err(res, 'Login failed. Please try again.', 400);
  }

  const { localId } = await resp.json() as { localId: string };
  const customToken = await getAdminAuth().createCustomToken(localId);
  return ok(res, { customToken });
}

async function handleForgot(req: VercelRequest, res: VercelResponse) {
  const body = parseBody(res, ForgotSchema, req.body);
  if (!body) return;

  const apiKey = process.env['FIREBASE_WEB_API_KEY'];
  // Fire and forget — always return generic success to prevent user enumeration
  fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email: body.email,
      }),
    },
  ).catch(() => {});

  return ok(res, {
    message: 'If an account exists for this email, a reset link has been sent.',
  });
}

async function handleGoogle(req: VercelRequest, res: VercelResponse) {
  const body = parseBody(res, GoogleSchema, req.body);
  if (!body) return;

  const clientId = process.env['GOOGLE_WEB_CLIENT_ID']!;
  const client = new OAuth2Client(clientId);

  let payload: { email?: string; email_verified?: boolean; sub?: string };
  try {
    const ticket = await client.verifyIdToken({
      idToken: body.idToken,
      audience: clientId,
    });
    payload = ticket.getPayload() ?? {};
  } catch {
    return err(res, 'Invalid Google token.', 401, 'INVALID_GOOGLE_TOKEN');
  }

  if (!payload.email_verified) {
    return err(res, 'Google account email is not verified.', 403, 'EMAIL_NOT_VERIFIED');
  }

  const email = payload.email!;
  const googleUid = payload.sub!;

  // Get or create the Firebase user
  let uid: string;
  try {
    const existing = await getAdminAuth().getUserByEmail(email);
    uid = existing.uid;
  } catch {
    // Create new user
    const newUser = await getAdminAuth().createUser({
      email,
      emailVerified: true,
      uid: `google_${googleUid}`,
    });
    uid = newUser.uid;
  }

  // Ensure user doc + code exist
  const fs = getAdminFirestore();
  const userRef = fs.collection('users').doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    const code = await createUniqueCode(uid);
    await userRef.set({
      username: email.split('@')[0] ?? '',
      email,
      code,
      onboarded: false,
      fcmTokens: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  const customToken = await getAdminAuth().createCustomToken(uid);
  return ok(res, { customToken });
}

// ── Router ────────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const { action } = req.query as { action: string };

  try {
    switch (action) {
      case 'signup':
        if (req.method !== 'POST') break;
        return void (await handleSignup(req, res));

      case 'login':
        if (req.method !== 'POST') break;
        return void (await handleLogin(req, res));

      case 'forgot':
        if (req.method !== 'POST') break;
        return void (await handleForgot(req, res));

      case 'google':
        if (req.method !== 'POST') break;
        return void (await handleGoogle(req, res));
    }

    err(res, 'Not found', 404);
  } catch (e) {
    console.error(`[api/auth/${action}]`, e);
    err(res, 'Internal server error', 500, 'INTERNAL');
  }
}
