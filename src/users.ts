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

const USERS_FILE = path.resolve(__dirname, "../users.json");

function load(): User[] {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")) as User[];
  } catch {
    return [];
  }
}

function save(users: User[]): void {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
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

export function registerUser(
  email: string,
  password: string
): { user: UserPublic } | { error: string } {
  if (!email || !password) return { error: "Email and password are required" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  const users = load();
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

  save([...users, user]);
  return { user: { id: user.id, email: user.email, apiKey: user.apiKey } };
}

export function loginUser(
  email: string,
  password: string
): { user: UserPublic } | { error: string } {
  if (!email || !password) return { error: "Email and password are required" };

  const users = load();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Invalid email or password" };
  }

  return { user: { id: user.id, email: user.email, apiKey: user.apiKey } };
}

export function validateApiKey(apiKey: string): boolean {
  if (!apiKey) return false;
  const users = load();
  if (users.some((u) => u.apiKey === apiKey)) return true;
  // fallback: env var master key for initial setup before any users register
  return !!process.env.SPHEGATTI_API_KEY && apiKey === process.env.SPHEGATTI_API_KEY;
}
