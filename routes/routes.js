import express from 'express';
import sharp from 'sharp';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import path from 'path';
import pool from '../db/db.js';
import bcrypt from 'bcrypt';
import { upload, persistentPath } from '../multer/multer.js';
import { add_people, add_vehicle } from '../functions.js';
import dotenv from 'dotenv';
import { log } from 'console';

dotenv.config();

const router = express.Router();

// * Middleware to authenticate the token
export const authToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  console.log("HEADER RECIBIDO:", authHeader); //* critic log
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) {
    console.warn('⚠️ Token ausente');
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.SECRET, (err, user) => {
    if (err) {
      console.error('❌ Token inválido o expirado:', err.message); //* critic log
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
};


//* delete images from server
router.post('/imagesd', async (req, res) => {
  
  try {
    const { url } = req.body;
    console.log('URL recibida:', url);
console.log('Archivo extraído:', path.basename(url));
console.log('Ruta final:', path.posix.join('/mnt/data/uploads', path.basename(url)));
console.log('Existe el archivo:', fs.existsSync(path.posix.join('/mnt/data/uploads', path.basename(url))));


    if (!url) {
      return res.status(400).json({ ok: false, message: 'URL de imagen no proporcionada' });
    }

    const fileName = path.basename(url);
    log('File name to delete:', fileName);
    const imagePath = path.posix.join('/mnt/data/uploads', fileName);

    console.log('Auth OK. Intentando borrar:', imagePath);

    if (fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
      } catch (error) {
        console.error('Error al borrar imagen:', error);
        return res.status(500).json({ ok: false, message: 'Error interno del servidor' });
      }
      console.log('Imagen borrada correctamente:', imagePath);}

  } catch (error) {
    console.error('Error al borrar imagen:', error);
    res.status(500).json({ ok: false, message: 'Error interno del servidor' });
  }
});



router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log(username, password);
  
  try {
    //* search the user in the database by code
    const userResult = await pool.query('SELECT * FROM users WHERE code = $1', [username]);
    
    //* if the user is not found
    if (userResult.rows.length === 0) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
    }
    
    const user = userResult.rows[0];

    //* check if the user is active
    if (user.status !== 'Active') {
      return res.status(401).json({ ok: false, message: 'Usuario inactivo' });
    }
    
    //* check if the password is correct
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
    }
    
    //* create the JWT token
    const token = jwt.sign({ 
      code: user.code,
      role: user.role 
    }, process.env.SECRET, { expiresIn: '1h' });
    
    res.json({ 
      ok: true, 
      token,
      user: {
        code: user.code,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
});

// * Route to upload image
router.post('/upload', authToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ stat: "error", message: "No se subió ningún archivo" });
  }

  try {
    const outputFilename = 'img-' + req.file.filename;
    const outputPath = path.join(persistentPath, outputFilename);

    await sharp(req.file.path)
      .resize({ width: 1200, height: 1200, fit: sharp.fit.inside, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    fs.unlinkSync(req.file.path);

    const fileUrl = `${req.protocol}://${req.get('host')}/files/${outputFilename}`;

    res.json({
      stat: "ok",
      message: "Imagen subida y redimensionada",
      file: {
        filename: outputFilename,
        url: fileUrl
      }
    });
  } catch (error) {
    console.error('Error al procesar la imagen:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ stat: "error", message: "Error al procesar la imagen" });
  }
});

// * Route to test database
router.get('/db', authToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send({ ok: true, time: result.rows[0].now });
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
    res.status(500).send({ ok: false, error: 'Error al conectar con la base de datos' });
  }
});

// * Basic GET route
router.get('/', (req, res) => {
  res.send({ ok: true, res: 'Hello Arba Dev!' });
});
// * Route to get all incidents
router.get('/incidents', authToken, async (req, res) => {

  try {
    const result = await pool.query('SELECT * FROM incidents');
    res.json({ ok: true, incidents: result.rows });
  } catch (error) {
    console.error('Error al obtener las incidencias:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener las incidencias' });
  }
});

// * Route to create an incident
router.post('/incidents', authToken, async (req, res) => {
  const {
    status,
    location,
    type,
    description,
    people = [],
    vehicles = [],
    images,
    brigade_field,
    creator_user_code
  } = req.body;
const brigadeFieldBool = brigade_field === true || brigade_field === 'true'; // Convert to boolean
  console.log(req.body);

  // * Validate required data
  if (!status || !location || !type || !description || brigadeFieldBool === undefined || !creator_user_code) {
    return res.status(400).json({ ok: false, message: 'Faltan datos obligatorios' });
  }

  try {
    await pool.query('BEGIN');

    const query = `
      INSERT INTO incidents (creation_date, status, location, type, description, brigade_field, creator_user_code)
      VALUES (NOW(), $1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [status, location, type, description, brigadeFieldBool, creator_user_code];
    const result = await pool.query(query, values);
    const incidentId = result.rows[0].code;

    // * Add related people
    if (Array.isArray(people)) {
      for (const person of people) {
        await add_people(person);
        const dni = person.dni;
        await pool.query(
          `INSERT INTO incidents_people (incident_code, person_dni) VALUES ($1, $2);`,
          [incidentId, dni]
        );
      }
    }

    // * Add related vehicles
    if (Array.isArray(vehicles)) {
      for (const vehicle of vehicles) {
        await add_vehicle(vehicle);
        // Usar brand, model, color, license_plate
        const license_plate = vehicle.license_plate;
        await pool.query(
          `INSERT INTO incidents_vehicles (incident_code, vehicle_license_plate) VALUES ($1, $2);`,
          [incidentId, license_plate]
        );
      }
    }
    // * Add related images
    if(Array.isArray(images)){
      for (const image of images) {
        const imagePath = image
        await pool.query(
          `INSERT INTO incident_images (incident_code, url) VALUES ($1, $2);`,
          [incidentId, imagePath]
        );
      }
    }

    await pool.query('COMMIT');

    console.log('People added:', people);
    console.log('Vehicles added:', vehicles);

    res.status(201).json({
      ok: true,
      message: `Incident created successfully`,
      incident: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error al crear la incidencia' });
    await pool.query('ROLLBACK');
    console.error('Error al insertar el incidente:', error);
    res.status(500).json({ ok: false, message: 'Error al insertar el incidente' });
  }
});

// * Route to update an incident
router.put('/incidents/:code/', authToken, async (req, res) => {
  log('Updating incident:', req.body);
  const { code } = req.params;
  const {
    status,
    location,
    type,
    description,
    brigade_field,
    people = [],
    vehicles = [],
    images,
    closure_user_code
  } = req.body;

  try {
    await pool.query('BEGIN');

    // Actualizar información básica de la incidencia, incluyendo brigade_field
    let query, values;

    if (status === 'Closed' && closure_user_code) {
      query = `
        UPDATE incidents 
        SET status = $1, location = $2, type = $3, description = $4, brigade_field = $5, closure_user_code = $6
        WHERE code = $7;
      `;
      values = [status, location, type, description, brigade_field, closure_user_code, code];
    } else {
      query = `
        UPDATE incidents 
        SET status = $1, location = $2, type = $3, description = $4, brigade_field = $5
        WHERE code = $6;
      `;
      values = [status, location, type, description, brigade_field, code];
    }

    await pool.query(query, values);

    // Actualizar personas relacionadas
    await pool.query('DELETE FROM incidents_people WHERE incident_code = $1', [code]);

    if (Array.isArray(people) && people.length > 0) {
      for (const person of people) {
        await add_people(person);
        await pool.query(
          `INSERT INTO incidents_people (incident_code, person_dni) VALUES ($1, $2);`,
          [code, person.dni]
        );
      }
    }

    // Actualizar vehículos relacionados
    await pool.query('DELETE FROM incidents_vehicles WHERE incident_code = $1', [code]);

    if (Array.isArray(vehicles) && vehicles.length > 0) {
      for (const vehicle of vehicles) {
        const { brand, model, color, license_plate } = vehicle;
        if (!brand || !model || !color || !license_plate) {
          throw new Error('Datos de vehículo incompletos');
        }
        await add_vehicle(vehicle);
        await pool.query(
          `INSERT INTO incidents_vehicles (incident_code, vehicle_license_plate) VALUES ($1, $2);`,
          [code, license_plate]
        );
      }
    }

    // Actualizar imágenes
    if (Array.isArray(images)) {
      await pool.query('DELETE FROM incident_images WHERE incident_code = $1', [code]);

      for (const image of images) {
        await pool.query(
          `INSERT INTO incident_images (incident_code, url) VALUES ($1, $2);`,
          [code, image]
        );
      }
    }

    await pool.query('COMMIT');
    res.json({ ok: true, message: 'Incidencia actualizada correctamente' });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error al actualizar la incidencia:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar la incidencia' });
  }
});


// * Route to get an incident with details (people, vehicles)
router.get('/incidents/:code/details', authToken, async (req, res) => {
  const { code } = req.params;

  try {
    // Get incident basic info
    const incidentResult = await pool.query('SELECT * FROM incidents WHERE code = $1', [code]);
    
    if (incidentResult.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Incidencia no encontrada' });
    }
    
    const incident = incidentResult.rows[0];
    
    // Get people related to this incident
    const peopleResult = await pool.query(`
      SELECT p.* 
      FROM people p
      JOIN incidents_people ip ON p.dni = ip.person_dni
      WHERE ip.incident_code = $1
    `, [code]);
    
    // Get vehicles related to this incident
    const vehiclesResult = await pool.query(`
      SELECT v.* 
      FROM vehicles v
      JOIN incidents_vehicles iv ON v.license_plate = iv.vehicle_license_plate
      WHERE iv.incident_code = $1
    `, [code]);
    
    // Get images related to this incident
    const imagesResult = await pool.query(`
      SELECT * FROM incident_images
      WHERE incident_code = $1
    `, [code]);
    
    res.json({
      ok: true,
      incident: incident,
      people: peopleResult.rows,
      vehicles: vehiclesResult.rows,
      images: imagesResult.rows
    });
    
  } catch (error) {
    console.error('Error al obtener detalles de la incidencia:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener detalles de la incidencia' });
  }
});
//* route to get the count of people in a incident
router.get('/incidents/:code/peoplecount', authToken, async (req, res) => {
  const { code } = req.params;
  const result = await pool.query(`select count(*) from incidents_people where incident_code='${code}'`);
  res.json({ ok: true, count: result.rows[0].count });
});
//* route to get the count of vehicles in a incident
router.get('/incidents/:code/vehiclescount', authToken, async (req, res) => {
  const { code } = req.params;
  const result = await pool.query(`select count(*) from incidents_vehicles where incident_code='${code}'`);
  res.json({ ok: true, count: result.rows[0].count });
});

//* route to close an incident
router.put('/incidents/:code/:usercode/close', authToken, async (req, res) => {

  const { code, usercode } = req.params;
  const result = await pool.query(`update incidents set status='Closed', closure_user_code='${usercode}' where code='${code}'`);
  res.json({ ok: true, message: 'Incidencia cerrada correctamente' });
  
});
// * Route to get users 
router.get('/users',authToken, async (req, res) => {
  console.log('users');
  
  try {
    const result = await pool.query('SELECT * FROM users');
if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'No se encontraron usuarios' });
    }
    res.json({ ok: true, data: result.rows });
  } catch (error) {
    console.error('Error al obtener los usuarios:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener los usuarios' });
  }
});
router.get('/user/:usercode', authToken, (req, res) => {
  const { usercode } = req.params;

  // Sólo permitir ver los datos del propio usuario
  if (req.user.code !== usercode) {
    return res.status(403).json({ ok: false, message: 'No puedes ver estos datos' });
  }

  const query = 'select * from incidents where creator_user_code = $1';
  pool.query(query, [usercode], (error, result) => {
    if (error) {
      console.error('Error al obtener las incidencias del usuario:', error);
      return res.status(500).json({ ok: false, message: 'Error al obtener las incidencias del usuario' });
    }
    res.json({ ok: true, data: result.rows });
  });
});


export default router;
