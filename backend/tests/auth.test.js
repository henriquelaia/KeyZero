process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.JWT_EXPIRES_IN = '1h';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createMockDb, installMockDb } = require('./helpers/mockDb');

let mock;
let request;

before(() => {
  mock = createMockDb();
  installMockDb(mock);
  const authRouter = require('../routes/auth');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  request = async (method, path, body) => {
    const http = require('node:http');
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
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

test('POST /register rejeita email inválido', async () => {
  const res = await request('POST', '/api/auth/register', { email: 'nao-email' });
  assert.equal(res.status, 400);
});

test('fluxo registo + login com authToken errado falha', async () => {
  const email = `user-${Date.now()}@example.com`;
  const reg = await request('POST', '/api/auth/register', { email });
  assert.equal(reg.status, 201);
  assert.ok(reg.json.userId && reg.json.salt);

  const fin = await request('POST', '/api/auth/register/finalize', {
    userId: reg.json.userId,
    authToken: 'a'.repeat(64),
  });
  assert.equal(fin.status, 200);
  assert.ok(fin.json.token);

  const login = await request('POST', '/api/auth/login', { email });
  assert.equal(login.status, 200);

  const bad = await request('POST', '/api/auth/login/verify', {
    userId: login.json.userId,
    authToken: 'b'.repeat(64),
  });
  assert.equal(bad.status, 401);

  const ok = await request('POST', '/api/auth/login/verify', {
    userId: login.json.userId,
    authToken: 'a'.repeat(64),
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.token);
});

test('login de email inexistente devolve credenciais inválidas', async () => {
  const res = await request('POST', '/api/auth/login', { email: 'nobody@example.com' });
  assert.equal(res.status, 404);
});

test('finalize sem registo pendente falha', async () => {
  const res = await request('POST', '/api/auth/register/finalize', {
    userId: '00000000-0000-0000-0000-000000000000',
    authToken: 'a'.repeat(64),
  });
  assert.equal(res.status, 404);
});
