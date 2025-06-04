import express from 'express';
import sharp from 'sharp';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import pool from '../db/db.js';
import bcrypt from 'bcrypt';
import { upload, persistentPath } from '../multer/multer.js';
import { add_people, add_vehicle, show_people } from '../functions.js';
import dotenv from 'dotenv';
import { log } from 'console';
import nodemailer from 'nodemailer';
import transporter from '../email/transporter.js'

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
      console.error('❌ Token inválido o expirado:', err.message); //! critic log
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

    // * post people
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


//* Route to show people
router.get('/people', async (req, res) => {
  try {
    const query = 'SELECT * FROM people';
    const result = await pool.query(query);
    res.status(200).json({ ok: true, data: result.rows});
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message});
  }
});


// * Route to get person
router.get('/people/:dni', async (req, res) => {
  const { dni } = req.params;
  try {
    const query = 'SELECT * FROM people WHERE dni = $1';
    const result = await pool.query(query, [dni]);

    if (result.rows.length <= 0) {
      return res.status(404).json({ ok: false, message: 'Persona no encontrada' });
    }

    res.status(200).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// * Route to upgrade a person
router.put('/people/:dni', async (req, res) => {
  const { dni } = req.params;
  const { first_name, last_name1, last_name2, phone_number } = req.body;

  try {
    const query = `
      UPDATE people
      SET first_name = $1, last_name1 = $2, last_name2 = $3, phone_number = $4
      WHERE dni = $5
      RETURNING *;
    `;
    const values = [first_name, last_name1, last_name2, phone_number, dni];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Persona no encontrada para actualizar' });
    }

    res.status(200).json({ ok: true, message: 'Persona actualizada', data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
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
// * Route to reset user password
// no token required for this route

// Importa tu transporter desde donde lo tengas configurado

// Función para enviar el email de reseteo de contraseña
async function sendPasswordEmail(to, newPassword) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: 'Restablecimiento de contraseña',
    html: `
      <h3>Restablecimiento de contraseña</h3>
      <p>Tu nueva contraseña es: <b>${newPassword}</b></p>
      <p>Te recomendamos cambiarla después de iniciar sesión.</p>
    `
  };
  await transporter.sendMail(mailOptions);
}

router.post('/users/resetpassword', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ ok: false, message: 'Email requerido' });

  try {
    // Busca el usuario
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.json({ ok: true, message: 'Si el usuario existe, recibirá un email con la nueva contraseña.' });
    }
    const user = result.rows[0];

    // Genera nueva password aleatoria segura (ej: 10 caracteres alfanuméricos)
    const newPassword = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0,10);

    // Hashea la nueva password
    const hash = await bcrypt.hash(newPassword, 10);

    // Guarda la nueva password
    await pool.query('UPDATE users SET password=$1 WHERE code=$2', [hash, user.code]);

    // Envía el email con la nueva password usando nodemailer
    await sendPasswordEmail(user.email, newPassword);

    return res.json({ ok: true, message: 'Si el usuario existe, recibirá un email con la nueva contraseña.' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error en el reseteo de contraseña.' });
  }
});

router.post('/users/force-reset-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ ok: false, message: 'Email requerido' });

  try {
    // Busca usuario
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      // SIEMPRE responde igual para no filtrar usuarios
      return res.json({ ok: true, message: 'Si el usuario existe, recibirá un email con la nueva contraseña.' });
    }
    const user = result.rows[0];

    // Genera password aleatoria segura
    const newPassword = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);

    // Hashea la nueva password
    const hash = await bcrypt.hash(newPassword, 10);

    // Actualiza password en la BBDD
    await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hash, user.email]);

    // Envía email usando nodemailer
    await sendPasswordEmail(user.email, newPassword);

    return res.json({ ok: true, message: 'Si el usuario existe, recibirá un email con la nueva contraseña.' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: 'Error en el reseteo de contraseña.' });
  }
});
//* route to get people related to an other person by dni
router.get('/people/rel/:dni', authToken, async (req, res) => {
  const { dni } = req.params;
  try {
    const query = `
      SELECT 
        p2.dni AS coincide_con,
        p2.first_name,
        p2.last_name1,
        p2.last_name2
      FROM 
        incidents_people ip1
      JOIN incidents_people ip2
        ON ip1.incident_code = ip2.incident_code
        AND ip1.person_dni <> ip2.person_dni
      JOIN people p2 ON p2.dni = ip2.person_dni
      WHERE ip1.person_dni = $1
      GROUP BY p2.dni, p2.first_name, p2.last_name1, p2.last_name2
    `;
    const result = await pool.query(query, [dni]);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'No se encontraron coincidencias' });
    }
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener coincidencias:', err);
    return res.status(500).json({ ok: false, message: 'Error al obtener coincidencias' });
  }
});
// * Route to get vehicles related to an other person by dni
router.get('/people/rel/:dni/vehicles', authToken, async (req, res) => {
  const { dni } = req.params;
  try {
    const query = `
      SELECT 
        v.license_plate,
        v.brand,
        v.model,
        v.color
      FROM 
        incidents_people ip
      JOIN incidents_vehicles iv
        ON ip.incident_code = iv.incident_code
      JOIN vehicles v ON v.license_plate = iv.vehicle_license_plate
      WHERE ip.person_dni = $1
      GROUP BY v.license_plate, v.brand, v.model, v.color
    `;
    const result = await pool.query(query, [dni]);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'No se encontraron vehículos coincidentes' });
    }
    return res.json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener vehículos coincidentes:', err);
    return res.status(500).json({ ok: false, message: 'Error al obtener vehículos coincidentes' });
  }
});
// * Route to get a user role by code
router.get('/users/role/:code', authToken, async (req, res) => {
  const { code } = req.params;
  try {
    const result = await pool.query('SELECT role FROM users WHERE code = $1', [code]);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }
    res.json({ ok: true, role: result.rows[0].role });
  } catch (error) {
    console.error('Error al obtener el rol del usuario:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener el rol del usuario' });
  }
});
// * Route to get user details by code
router.get('/users/:code', authToken, async (req, res) => {
  const { code } = req.params;
  try {
    const result = await pool.query('SELECT * FROM users WHERE code = $1', [code]);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }
    res.json({ ok: true, user: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener los detalles del usuario:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener los detalles del usuario' });
  }
});
// * Route to update user details
router.put('/users/:code', authToken, async (req, res) => {
  const { code } = req.params;
  const { email, password, role, status } = req.body;
  try {
    // Comprobar que el usuario existe
    const userResult = await pool.query('SELECT * FROM users WHERE code = $1', [code]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

 
    const query = password !== "" ? `
      UPDATE users 
      SET email = $1, password = $2, role = $3, status = $4 
      WHERE code = $5 
      RETURNING *;
    ` : `
      UPDATE users 
      SET email = $1, role = $2, status = $3 
      WHERE code = $4 
      RETURNING *;`;

    const values = password !== ""
      ? [email, password, role, status, code]
      : [email, role, status, code];

    const result = await pool.query(query, values);

    res.json({ ok: true, user: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar los detalles del usuario:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar los detalles del usuario' });
  }
});

//* get all users
router.get('/users', authToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'No se encontraron usuarios' });
    }
    res.json({ ok: true, users: result.rows });
  } catch (error) {
    console.error('Error al obtener los usuarios:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener los usuarios' });
  }
});
// * update user password and email
router.put('/users/:code/password', authToken, async (req, res) => {
  const { code } = req.params;
  const { email, password } = req.body;

  try {
    // Comprobar que el usuario existe
    const userResult = await pool.query('SELECT * FROM users WHERE code = $1', [code]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    const query = `
      UPDATE users 
      SET email = $1, password = $2 
      WHERE code = $3 
      RETURNING *;
    `;
    const values = [email, password, code];

    const result = await pool.query(query, values);

    res.json({ ok: true, user: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar la contraseña del usuario:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar la contraseña del usuario' });
  }
});
// * Route to delete a user
router.delete('/users/:code', authToken, async (req, res) => {
  const { code } = req.params;

  try {
    // Comprobar que el usuario existe
    const userResult = await pool.query('SELECT * FROM users WHERE code = $1', [code]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    // Eliminar el usuario
    await pool.query('DELETE FROM users WHERE code = $1', [code]);

    res.json({ ok: true, message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar el usuario:', error);
    res.status(500).json({ ok: false, message: 'Error al eliminar el usuario' });
  }
});
//*route to create a new user
router.post('/users', authToken, async (req, res) => {
  const { code, email, password, role, status } = req.body;

  try {
    const result = await pool.query(`
      INSERT INTO users (code, email, password, role, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `, [code, email, password, role, status]);

    res.status(201).json({ ok: true, user: result.rows[0] });
  } catch (error) {
    console.error('Error al crear el usuario:', error);
    res.status(500).json({ ok: false, message: 'Error al crear el usuario' });
  }
});

export default router;
