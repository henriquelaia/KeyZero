process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.JWT_EXPIRES_IN = '1h';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { SignJWT } = require('jose');
const { createMockDb, installMockDb } = require('./helpers/mockDb');

const blob = JSON.stringify({ ct: 'AAAA', iv: 'BBBB' });

async function jwtFor(userId) {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

let mock;
let request;

before(() => {
  mock = createMockDb();
  installMockDb(mock);
  const passwordsRouter = require('../routes/passwords');
  const app = express();
  app.use(express.json());
  app.use('/api/passwords', passwordsRouter);
  request = async (method, path, { token, body } = {}) => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    server.close();
    return { status: res.status, json };
  };
});

test('CRUD sem JWT é rejeitado', async () => {
  const res = await request('GET', '/api/passwords');
  assert.equal(res.status, 401);
});

test('utilizador A não apaga nem edita registo de B (isolamento user_id)', async () => {
  const tokenA = await jwtFor('user-a');
  const tokenB = await jwtFor('user-b');

  const created = await request('POST', '/api/passwords', {
    token: tokenA,
    body: { site: 'example.com', username: 'a', encrypted_password: blob },
  });
  assert.equal(created.status, 201);
  const id = created.json.id;

  const delAsB = await request('DELETE', `/api/passwords/${id}`, { token: tokenB });
  assert.equal(delAsB.status, 404);
  assert.equal(mock.store.passwords.length, 1);

  const putAsB = await request('PUT', `/api/passwords/${id}`, {
    token: tokenB,
    body: { site: 'evil.com', encrypted_password: blob },
  });
  assert.equal(putAsB.status, 404);
  assert.equal(mock.store.passwords[0].site, 'example.com');

  const listB = await request('GET', '/api/passwords', { token: tokenB });
  assert.equal(listB.status, 200);
  assert.deepEqual(listB.json, []);

  const listA = await request('GET', '/api/passwords', { token: tokenA });
  assert.equal(listA.status, 200);
  assert.equal(listA.json.length, 1);
});

test('encrypted_password malformado é rejeitado', async () => {
  const token = await jwtFor('user-c');
  const res = await request('POST', '/api/passwords', {
    token,
    body: { site: 'x.com', encrypted_password: 'not-json' },
  });
  assert.equal(res.status, 400);
});
