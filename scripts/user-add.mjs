#!/usr/bin/env node
// Crea un usuario o cambia su contraseña (y cierra sus sesiones).
// Uso: npm run user:add -- correo@dominio.com "Nombre" [--remote]
import { spawnSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ITERATIONS } from '../src/auth.js';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const [email, name = ''] = args.filter((a) => !a.startsWith('--'));
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Uso: npm run user:add -- correo@dominio.com "Nombre" [--remote]');
  process.exit(1);
}

function readPassword() {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write('Contraseña (mínimo 10 caracteres): ');
    let buf = '';
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', (chunk) => {
      for (const c of chunk) {
        if (c === '\u0003') process.exit(130);
        if (c === '\r' || c === '\n') {
          if (stdin.isTTY) stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
          return resolve(buf);
        }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else buf += c;
      }
    });
    stdin.on('end', () => resolve(buf));
  });
}

const password = await readPassword();
if (password.length < 10) {
  console.error('La contraseña debe tener al menos 10 caracteres.');
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
const mail = email.trim().toLowerCase();
const sql = `INSERT INTO users (id, email, name, pass_hash, pass_salt, iterations, created_at)
VALUES (${q(randomUUID())}, ${q(mail)}, ${q(name)}, ${q(hash.toString('base64'))}, ${q(salt.toString('base64'))}, ${ITERATIONS}, ${Date.now()})
ON CONFLICT(email) DO UPDATE SET pass_hash = excluded.pass_hash, pass_salt = excluded.pass_salt,
  iterations = excluded.iterations, name = CASE WHEN excluded.name = '' THEN users.name ELSE excluded.name END;
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ${q(mail)});
`;

const dir = mkdtempSync(join(tmpdir(), 'presupuestos-'));
const file = join(dir, 'user.sql');
writeFileSync(file, sql, { mode: 0o600 });
const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'presupuestos', remote ? '--remote' : '--local', '--yes', `--file="${file}"`], { stdio: 'inherit', shell: true });
rmSync(dir, { recursive: true, force: true });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`Listo: ${mail} (${remote ? 'producción' : 'local'}).`);
