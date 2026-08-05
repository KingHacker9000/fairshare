import { db, id, nowIso } from './db.js';
import { hashPassword } from './auth.js';

const now = nowIso();
const users = [
  { id: id('usr'), email: 'ashish@example.com', name: 'Ashish' },
  { id: id('usr'), email: 'veeraj@example.com', name: 'Veeraj' },
  { id: id('usr'), email: 'hari@example.com', name: 'Hari' },
];
const insertUser = db.prepare(
  `INSERT OR IGNORE INTO users (id, email, display_name, password_hash, default_currency, created_at, updated_at)
   VALUES (?, ?, ?, ?, 'INR', ?, ?)`,
);
for (const user of users) insertUser.run(user.id, user.email, user.name, hashPassword('Password123!'), now, now);
console.log('Seed users created. Password: Password123!');
