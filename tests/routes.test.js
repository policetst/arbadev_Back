// tests/routes.test.js
import request from 'supertest';
import express from 'express';
import { jest } from '@jest/globals';
// --- MOCKS PARA ESM ---
// Pool mockeado (Jest 29+, ESM)
jest.unstable_mockModule('../db/db.js', () => ({
  default: { query: jest.fn(), connect: jest.fn() }
}));

jest.unstable_mockModule('bcrypt', () => ({
  default: {
    compare: jest.fn().mockResolvedValue(true),
    hash: jest.fn().mockResolvedValue('hashedpass')
  }
}));

jest.unstable_mockModule('jsonwebtoken', () => ({
  default: {
    sign: jest.fn().mockReturnValue('fake.token.value'),
    verify: jest.fn((token, secret, cb) => cb(null, { code: 'admin', role: 'admin' }))
  }
}));

jest.unstable_mockModule('../functions.js', () => ({
  add_people: jest.fn(),
  add_vehicle: jest.fn(),
  show_people: jest.fn(),
  show_vehicles: jest.fn().mockResolvedValue([{ license_plate: '0000ABC' }]),
  getPeopleRelPerson: jest.fn((req, res) => res.json({ ok: true })),
  getVehiclesRelPerson: jest.fn((req, res) => res.json({ ok: true })),
  getPeopleRelVehicle: jest.fn((req, res) => res.json({ ok: true })),
  getVehiclesRelVehicle: jest.fn((req, res) => res.json({ ok: true }))
}));

jest.unstable_mockModule('../email/transporter.js', () => ({
  default: { sendMail: jest.fn().mockResolvedValue() }
}));

jest.unstable_mockModule('sharp', () => ({
  default: () => ({
    resize: () => ({
      jpeg: () => ({
        toFile: jest.fn().mockResolvedValue()
      })
    })
  })
}));

jest.unstable_mockModule('fs', () => ({
  default: {
    unlinkSync: jest.fn(),
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn()
  }
}));

jest.unstable_mockModule('path', () => ({
  default: {
    basename: jest.fn((p) => p.split('/').pop()),
    join: jest.fn((...args) => args.join('/')),
    posix: {
      join: jest.fn((...args) => args.join('/'))
    }
  }
}));

// --- IMPORTS DINÁMICOS DESPUÉS DE LOS MOCKS ---
let pool, bcrypt, router;
beforeAll(async () => {
  pool = (await import('../db/db.js')).default;
  bcrypt = (await import('bcrypt')).default;
  router = (await import('../routes/routes.js')).default;
});

const app = express();
app.use(express.json());
app.use('/', (req, res, next) => router(req, res, next));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Rutas completas backend', () => {

  // ---------- Rutas sueltas -----------
  it('GET / debe responder con ok:true', async () => {
    const res = await request(app).get('/');
    expect(res.body.ok).toBe(true);
  });

  it('GET /db devuelve fecha actual', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ now: '2024-01-01T12:00:00Z' }] });
    const res = await request(app).get('/db').set('Authorization', 'Bearer valid');
    expect(res.body.ok).toBe(true);
    expect(res.body.time).toBe('2024-01-01T12:00:00Z');
  });

  // --------------- LOGIN ---------------------
  it('POST /login credenciales válidas', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ code: 'testuser', role: 'admin', status: 'Active', password: '123', email: 't@e', must_change_password: false }] });
    bcrypt.compare.mockResolvedValueOnce(true);
    const res = await request(app).post('/login').send({ username: 'testuser', password: '123' });
    expect(res.body.ok).toBe(true);
    expect(res.body.user.code).toBe('testuser');
  });

  it('POST /login usuario no existe', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/login').send({ username: 'bad', password: 'x' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /login usuario inactivo', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ code: 'u', role: 'admin', status: 'Inactive', password: 'x', email: 'e', must_change_password: false }] });
    const res = await request(app).post('/login').send({ username: 'u', password: 'x' });
    expect(res.statusCode).toBe(401);
  });

  // --------------- USERS ---------------------
  it('GET /users devuelve usuarios', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ code: 'u1' }] });
    const res = await request(app).get('/users').set('Authorization', 'Bearer valid');
    expect(res.body.ok).toBe(true);
  });

  it('GET /users devuelve 404 si no hay usuarios', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/users').set('Authorization', 'Bearer valid');
    expect(res.statusCode).toBe(404);
  });

  it('POST /users/resetpassword sin email da 400', async () => {
    const res = await request(app).post('/users/resetpassword').send({});
    expect(res.statusCode).toBe(400);
  });

  it('POST /users/resetpassword ok aunque no exista', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/users/resetpassword').send({ email: 't@t.com' });
    expect(res.body.ok).toBe(true);
  });

  it('POST /users fuerza reset password aunque no exista', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).post('/users/force-reset-password').send({ email: 't@t.com' });
    expect(res.body.ok).toBe(true);
  });

  it('GET /users/:code devuelve detalles', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ code: 'u1' }] });
    const res = await request(app).get('/users/u1').set('Authorization', 'Bearer valid');
    expect(res.body.ok).toBe(true);
  });

  it('GET /users/role/:code devuelve rol', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });
    const res = await request(app).get('/users/role/u1').set('Authorization', 'Bearer valid');
    expect(res.body.role).toBe('admin');
  });

  // --------------- PEOPLE ---------------------
  it('GET /people lista personas', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ dni: '1' }] });
    const res = await request(app).get('/people');
    expect(res.body.ok).toBe(true);
  });

  it('GET /people/:dni encuentra persona', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ dni: '1' }] });
    const res = await request(app).get('/people/1');
    expect(res.body.ok).toBe(true);
  });

  it('GET /people/:dni no encuentra', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/people/0');
    expect(res.statusCode).toBe(404);
  });

  it('PUT /people/:dni actualiza persona', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ dni: '1', first_name: 'Test' }] });
    const res = await request(app).put('/people/1').send({ first_name: 'Test', last_name1: '', last_name2: '', phone_number: '' });
    expect(res.body.ok).toBe(true);
  });

  // --------------- VEHICLES -------------------
  it('GET /vehicles lista vehículos', async () => {
    const res = await request(app).get('/vehicles');
    expect(res.body.ok).toBe(true);
  });

  it('GET /vehicles/:license_plate encuentra', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ license_plate: '0000ABC' }] });
    const res = await request(app).get('/vehicles/0000ABC');
    expect(res.body.ok).toBe(true);
  });

  it('GET /vehicles/:license_plate no encuentra', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/vehicles/0000ZZZ');
    expect(res.statusCode).toBe(404);
  });

  it('PUT /vehicles/:license_plate actualiza vehículo', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ license_plate: '0000ABC' }] });
    const res = await request(app).put('/vehicles/0000ABC').send({ brand: 'a', model: 'b', color: 'c' });
    expect(res.body.ok).toBe(true);
  });

  // --------------- INCIDENTS ---------------------
  it('GET /incidents devuelve incidencias', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ code: 'INC1' }] });
    const res = await request(app).get('/incidents').set('Authorization', 'Bearer valid');
    expect(res.body.ok).toBe(true);
  });

  it('POST /incidents crea incidencia', async () => {
    pool.query.mockResolvedValueOnce(); // BEGIN
    pool.query.mockResolvedValueOnce({ rows: [{ code: 'INC001' }] }); // Insert
    pool.query.mockResolvedValueOnce(); // COMMIT
    const res = await request(app).post('/incidents').send({
      status: 'Open',
      location: 'Av España',
      type: 'Robo',
      description: 'Test',
      people: [],
      vehicles: [],
      images: [],
      brigade_field: false,
      creator_user_code: 'admin'
    }).set('Authorization', 'Bearer valid');
    expect(res.statusCode).toBe(201);
  });

  it('PUT /incidents/:code actualiza', async () => {
    pool.query.mockResolvedValueOnce(); // BEGIN
    pool.query.mockResolvedValueOnce(); // UPDATE
    pool.query.mockResolvedValueOnce(); // DELETE people
    pool.query.mockResolvedValueOnce(); // DELETE vehicles
    pool.query.mockResolvedValueOnce(); // DELETE images
    pool.query.mockResolvedValueOnce(); // COMMIT
    const res = await request(app).put('/incidents/INC001/').send({
      status: 'Closed',
      location: 'Av España',
      type: 'Robo',
      description: 'Test',
      brigade_field: false,
      closure_user_code: 'admin',
      people: [],
      vehicles: [],
      images: []
    }).set('Authorization', 'Bearer valid');
    expect(res.body.ok).toBe(true);
  });

  it('POST /imagesd sin url da 400', async () => {
    const res = await request(app).post('/imagesd').send({});
    expect(res.statusCode).toBe(400);
  });

  it('GET /incidents/open lista abiertas', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ code: 'INC' }] });
    const res = await request(app).get('/incidents/open').set('Authorization', 'Bearer valid');
    expect(res.body.ok).toBe(true);
  });

  it('GET /config/email devuelve email', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ brigade_field: 'brigade@local.es' }] });
    const res = await request(app).get('/config/email').set('Authorization', 'Bearer valid');
    expect(res.body.ok).toBe(true);
  });

  it('PUT /config/email actualiza email', async () => {
    pool.query.mockResolvedValueOnce();
    const res = await request(app).put('/config/email').send({ email: 'b@b.com' }).set('Authorization', 'Bearer valid');
    expect(res.body.ok).toBe(true);
  });

  // --------------- INCIDENT-PERSON/VEHICLE --------------
  it('GET /incident-vehicle/:license_plate', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ incident_code: 'I', dni: '1', first_name: 'A', last_name1: 'B' }] });
    const res = await request(app).get('/incident-vehicle/0000ABC');
    expect(res.body.ok).toBe(true);
  });

  it('GET /incident-person/:dni', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ incident_code: 'I', description: 'D', creation_date: '2024-01-01' }] });
    const res = await request(app).get('/incident-person/1');
    expect(res.body.ok).toBe(true);
  });

  // Puedes añadir más tests de todas las rutas que necesites aquí

});
