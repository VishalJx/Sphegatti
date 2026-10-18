import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

type User = {
  id: string;
  email: string;
  passwordHash: string;
  apiKey: string;
  createdAt: string;
};

export type UserPublic = { id: string; email: string; apiKey: string };

const LOCAL_USERS_FILE = path.resolve(__dirname, "../users.json");

function usersS3Key(): string {
  return `${process.env.S3_KEY_PREFIX ?? "sphegatti/"}users.json`;
}

async function loadUsers(): Promise<User[]> {
  if (process.env.S3_BUCKET) {
    try {
      const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
      const s3 = new S3Client({ region: process.env.S3_REGION ?? "us-east-1" });
      const res = await s3.send(
        new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: usersS3Key() })
      );
      const body = await (res.Body as { transformToString(): Promise<string> }).transformToString();
      return JSON.parse(body) as User[];
    } catch (e: unknown) {
      if ((e as { name?: string }).name === "NoSuchKey") return [];
      throw e;
    }
  }
  try {
    return JSON.parse(fs.readFileSync(LOCAL_USERS_FILE, "utf-8")) as User[];
  } catch {
    return [];
  }
}

async function saveUsers(users: User[]): Promise<void> {
  if (process.env.S3_BUCKET) {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const s3 = new S3Client({ region: process.env.S3_REGION ?? "us-east-1" });
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: usersS3Key(),
        Body: JSON.stringify(users, null, 2),
        ContentType: "application/json",
      })
    );
    return;
  }
  fs.writeFileSync(LOCAL_USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const verify = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verify, "hex"));
  } catch {
    return false;
  }
}

export async function registerUser(
  email: string,
  password: string
): Promise<{ user: UserPublic } | { error: string }> {
  if (!email || !password) return { error: "Email and password are required" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  const users = await loadUsers();
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase().trim())) {
    return { error: "Email already registered" };
  }

  const user: User = {
    id: crypto.randomUUID(),
    email: email.toLowerCase().trim(),
    passwordHash: hashPassword(password),
    apiKey: "spg_" + crypto.randomBytes(24).toString("hex"),
    createdAt: new Date().toISOString(),
  };

  await saveUsers([...users, user]);
  return { user: { id: user.id, email: user.email, apiKey: user.apiKey } };
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ user: UserPublic } | { error: string }> {
  if (!email || !password) return { error: "Email and password are required" };

  const users = await loadUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid email or password" };
  }

  return { user: { id: user.id, email: user.email, apiKey: user.apiKey } };
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey) return false;
  // Fast-path: master key from env (no S3 read needed)
  if (process.env.SPHEGATTI_API_KEY && apiKey === process.env.SPHEGATTI_API_KEY) return true;
  const users = await loadUsers();
  return users.some((u) => u.apiKey === apiKey);
}
