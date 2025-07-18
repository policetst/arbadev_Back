import express from 'express';
import sharp from 'sharp';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import pool from '../db/db.js';
import bcrypt from 'bcrypt';
import { upload, persistentPath } from '../multer/multer.js';
import { add_people, add_vehicle, show_people, show_vehicles } from '../functions.js';
import dotenv from 'dotenv';
import { log } from 'console';
import nodemailer from 'nodemailer';
import transporter from '../email/transporter.js'
import { getPeopleRelPerson, getVehiclesRelPerson } from '../functions.js';
import { getPeopleRelVehicle, getVehiclesRelVehicle } from '../functions.js';

dotenv.config();

const router = express.Router();

router.get('/related-peoplep/:dni', getPeopleRelPerson);
router.get('/related-vehiclesp/:dni', getVehiclesRelPerson);
router.get('/related-people/:license_plate', getPeopleRelVehicle);
router.get('/related-vehicles/:license_plate', getVehiclesRelVehicle);

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
router.post('/imagesd', authToken, async (req, res) => {
  
  try {
    const { url } = req.body;
    if( !url) {
      return res.status(400).json({ ok: false, message: 'URL de imagen no proporcionada' });
    }
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
    const userResult = await pool.query('SELECT * FROM users WHERE code = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
    }
    
    const user = userResult.rows[0];
    if (user.status !== 'Active') {
      return res.status(401).json({ ok: false, message: 'Usuario inactivo' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
    }
    
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
        role: user.role,
        must_change_password: user.must_change_password // <-- añade esto
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
// * Route to change brigade_field status
router.put('/incidents/:code/brigade_field', authToken, async (req, res) => {
  const { code } = req.params;
  const { brigade_field } = req.body;

  try {
    await pool.query('BEGIN');

    const query = `
      UPDATE incidents
      SET brigade_field = $1
      WHERE code = $2;
    `;
    await pool.query(query, [brigade_field, code]);

    await pool.query('COMMIT');
    res.json({ ok: true, message: 'Estado de brigade_field actualizado correctamente' });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error al actualizar el estado de brigade_field:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar el estado de brigade_field' });
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
router.get('/people', authToken, async (req, res) => {
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
router.put('/people/:dni',authToken, async (req, res) => {
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

//* Route to show vehicles   
router.get('/vehicles',authToken, async (req, res) => {
  try {
    const vehicles = await show_vehicles();
    res.json({ ok: true, data: vehicles });
  } catch (err) {
    console.error('Error al obtener vehículos:', err);
    res.status(500).json({ ok: false, message: 'Error al obtener vehículos' });
  }
});


// * Route to get vehicle
router.get('/vehicles/:license_plate', authToken, async (req, res) => {
  const { license_plate } = req.params;
  try {
    const query = 'SELECT * FROM vehicles WHERE license_plate = $1';
    const result = await pool.query(query, [license_plate]);

    if (result.rows.length <= 0) {
      return res.status(404).json({ ok: false, message: 'Vehiculo no encontrado' });
    }

    res.status(200).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});


// * Route to upgrade a vehicle
router.put('/vehicles/:license_plate', authToken, async (req, res) => {
  const { license_plate } = req.params;
  const { brand, model, color } = req.body;

  try {
    const query = `
      UPDATE vehicles
      SET brand = $1, model = $2, color = $3
      WHERE license_plate = $4
      RETURNING *;
    `;
    const values = [brand, model, color, license_plate];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Vehiculo no encontrado para actualizar' });
    }

    res.status(200).json({ ok: true, message: 'Vehiculo actualizado', data: result.rows[0] });
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
// * Route to get incidents by user code
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
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.json({ ok: true, message: 'Si el usuario existe, recibirá un email con la nueva contraseña.' });
    }
    const user = result.rows[0];

    const newPassword = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0,10);
    const hash = await bcrypt.hash(newPassword, 10);

    // Cambia aquí: pon el flag a true
    await pool.query('UPDATE users SET password=$1, must_change_password=true WHERE code=$2', [hash, user.code]);

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
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.json({ ok: true, message: 'Si el usuario existe, recibirá un email con la nueva contraseña.' });
    }
    const user = result.rows[0];

    const newPassword = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
    const hash = await bcrypt.hash(newPassword, 10);

    // Cambia aquí: pon el flag a true
    await pool.query('UPDATE users SET password = $1, must_change_password = true WHERE email = $2', [hash, user.email]);

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

 
    const query = `
      UPDATE users 
      SET email = $1, password = $2, role = $3, status = $4 
      WHERE code = $5 
      RETURNING *`;

    const values = [email, password, role, status, code];

    const result = await pool.query(query, values);

    res.json({ ok: true, user: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar los detalles del usuario:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar los detalles del usuario' });
  }
  
});
//* Route to get user login state
router.post('/users/loginstate', authToken, async (req, res) => {
  try{
    const { code } = req.user;
    console.log('Código del usuario:', code);

    const query = `select * from users where code = $1`
    const result = await pool.query(query, [code]);
    res.json({ ok: true, must_change_password: result.rows[0].must_change_password });
  } catch (error) {
    console.error('Error al obtener el estado de inicio de sesión del usuario:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener el estado de inicio de sesión del usuario' });
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
router.put('/users/:code/passwordd', authToken, async (req, res) => {
  const { code } = req.params;
  const { email, password } = req.body;

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE code = $1', [code]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }

    // Hashea la password aquí antes de guardarla
    const hash = await bcrypt.hash(password, 10);

    // Importante: pone must_change_password a false
    const query = `
      UPDATE users 
      SET email = $1, password = $2, must_change_password = false
      WHERE code = $3 
      RETURNING *;
    `;
    const values = [email, hash, code];
    const result = await pool.query(query, values);


    res.json({ ok: true, user: result.rows[0] });
  } catch (error) {
    console.error('Error al actualizar la contraseña del usuario:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar la contraseña del usuario' });
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

//* get Open incidents
router.get('/incidents/open', authToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM incidents WHERE status = $1', ['Open']);
    res.json({ ok: true, incidents: result.rows });
  } catch (error) {
    console.error('Error al obtener las incidencias abiertas:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener las incidencias abiertas' });
  }
});
//* route to get email from config
router.get('/config/email', authToken, async (req, res) => {
  try{
    const query = 'SELECT * FROM app_config';
    const result = await pool.query(query);
    res.json({ ok: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener la configuración de email:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener la configuración de email' });
  }});
// * Route to update email configuration
router.put('/config/email', authToken, async (req, res) => {
  const { email } = req.body;
  try {
    const query = 'UPDATE app_config SET brigade_field = $1';
    await pool.query(query, [email]);
    res.json({ ok: true, message: 'Configuración de email actualizada' });
  } catch (error) {
    console.error('Error al actualizar la configuración de email:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar la configuración de email' });
  }
});
// * Route to put teammate to a incident
router.put('/incidents/:code/teammate/:teammateCode', authToken, async (req, res) => {
  const { code, teammateCode } = req.params;

  try {
    const query = `
      UPDATE incidents
      SET team_mate = $1
      WHERE code = $2
    
      RETURNING *;
    `;
    const values = [teammateCode, code];

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Incidencia no encontrada' });
    }

    res.status(200).json({ ok: true, incident: result.rows[0] });
  } catch (error) {
    console.error('Error al asignar compañero a la incidencia:', error);
    res.status(500).json({ ok: false, message: 'Error al asignar compañero a la incidencia' });
  }
});

//* Route to get incidents of a vehicle
// * Route to get incidents related to a vehicle (inline)
router.get('/incident-vehicle/:license_plate', async (req, res) => {
  const { license_plate } = req.params;

  try {
    const query = `
      SELECT 
        i.code AS incident_code,
        p.dni,
        p.first_name,
        p.last_name1
      FROM incidents i
      JOIN incidents_vehicles iv ON i.code = iv.incident_code
      LEFT JOIN incidents_people ip ON ip.incident_code = i.code
      LEFT JOIN people p ON p.dni = ip.person_dni
      WHERE iv.vehicle_license_plate = $1
    `;
    const result = await pool.query(query, [license_plate]);

    res.status(200).json({ ok: true, data: result.rows });
  } catch (err) {
    console.error('Error al obtener incidencias por vehículo:', err);
    res.status(500).json({ ok: false, message: 'Error al obtener incidencias por vehículo' });
  }
});
//* route to get incidents of a person
router.get('/incident-person/:dni', async (req, res) => {
  const { dni } = req.params;

  try {
    const result = await pool.query(`
      SELECT i.code AS incident_code, i.description, i.creation_date
      FROM incidents_people ip
      JOIN incidents i ON ip.incident_code = i.code
      WHERE ip.person_dni = $1
    `, [dni]);

    res.json({ ok: true, data: result.rows });
  } catch (error) {
    console.error('Error al obtener incidencias relacionadas:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});


// ==================== RUTAS PARA ATESTADOS ====================

// * Route to get all atestados
router.get('/atestados', authToken, async (req, res) => {
  try {
    const query = `
      SELECT 
        a.*,
        COUNT(d.id) as total_diligencias
      FROM atestados a
      LEFT JOIN diligencias d ON a.id = d.atestado_id
      GROUP BY a.id
      ORDER BY a.fecha DESC
    `;
    const result = await pool.query(query);
    res.json({ ok: true, atestados: result.rows });
  } catch (error) {
    console.error('Error al obtener atestados:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener atestados' });
  }
});

// * Route to create a new atestado
router.post('/atestados', authToken, async (req, res) => {
  const { numero, fecha, descripcion, estado = 'activo' } = req.body;

  if (!numero || !fecha) {
    return res.status(400).json({ ok: false, message: 'Número y fecha son obligatorios' });
  }

  try {
    const query = `
      INSERT INTO atestados (numero, fecha, descripcion, estado)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [numero, fecha, descripcion, estado];
    const result = await pool.query(query, values);

    res.status(201).json({
      ok: true,
      message: 'Atestado creado correctamente',
      atestado: result.rows[0]
    });
  } catch (error) {
    console.error('Error al crear atestado:', error);
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ ok: false, message: 'Ya existe un atestado con ese número' });
    } else {
      res.status(500).json({ ok: false, message: 'Error al crear atestado' });
    }
  }
});

// * Route to get a specific atestado with its diligencias
router.get('/atestados/:id', authToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Get atestado basic info
    const atestadoResult = await pool.query('SELECT * FROM atestados WHERE id = $1', [id]);
    
    if (atestadoResult.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Atestado no encontrado' });
    }

    // Get diligencias with plantilla info
    const diligenciasResult = await pool.query(`
      SELECT 
        d.*,
        p.name as plantilla_nombre,
        p.content as plantilla_content,
        json_agg(
          json_build_object(
            'variable', dv.variable,
            'valor', dv.valor
          )
        ) as valores
      FROM diligencias d
      JOIN plantillas p ON d.plantilla_id = p.id
      LEFT JOIN diligencia_valores dv ON d.id = dv.diligencia_id
      WHERE d.atestado_id = $1
      GROUP BY d.id, p.name, p.content
      ORDER BY d.created_at
    `, [id]);

    res.json({
      ok: true,
      atestado: atestadoResult.rows[0],
      diligencias: diligenciasResult.rows
    });
  } catch (error) {
    console.error('Error al obtener atestado:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener atestado' });
  }
});

// * Route to update an atestado
router.put('/atestados/:id', authToken, async (req, res) => {
  const { id } = req.params;
  const { numero, fecha, descripcion, estado } = req.body;

  try {
    const query = `
      UPDATE atestados 
      SET numero = $1, fecha = $2, descripcion = $3, estado = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    const values = [numero, fecha, descripcion, estado, id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Atestado no encontrado' });
    }

    res.json({
      ok: true,
      message: 'Atestado actualizado correctamente',
      atestado: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar atestado:', error);
    if (error.code === '23505') {
      res.status(400).json({ ok: false, message: 'Ya existe un atestado con ese número' });
    } else {
      res.status(500).json({ ok: false, message: 'Error al actualizar atestado' });
    }
  }
});

// * Route to delete an atestado
router.delete('/atestados/:id', authToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM atestados WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Atestado no encontrado' });
    }

    res.json({ ok: true, message: 'Atestado eliminado correctamente' });
  } catch (error) {
    console.error('Error al eliminar atestado:', error);
    res.status(500).json({ ok: false, message: 'Error al eliminar atestado' });
  }
});

// ==================== RUTAS PARA PLANTILLAS ====================

// * Route to get all plantillas
router.get('/plantillas', authToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        description,
        content,
        variables,
        created_at,
        updated_at
      FROM plantillas 
      ORDER BY name
    `);
    
    // Parse variables JSON and add variables array for components
    const plantillas = result.rows.map(plantilla => ({
      ...plantilla,
      variables: plantilla.variables || []
    }));

    res.json({ ok: true, plantillas });
  } catch (error) {
    console.error('Error al obtener plantillas:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener plantillas' });
  }
});

// * Route to create a new plantilla
router.post('/plantillas', authToken, async (req, res) => {
  const { name, description, content } = req.body;

  if (!name || !content) {
    return res.status(400).json({ ok: false, message: 'Nombre y contenido son obligatorios' });
  }

  try {
    // Extract variables from content
    const variableRegex = /\{([^}]+)\}/g;
    const variables = [];
    let match;
    
    while ((match = variableRegex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    const query = `
      INSERT INTO plantillas (name, description, content, variables)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const values = [name, description, content, JSON.stringify(variables)];
    const result = await pool.query(query, values);

    const plantilla = {
      ...result.rows[0],
      variables: variables
    };

    res.status(201).json({
      ok: true,
      message: 'Plantilla creada correctamente',
      plantilla
    });
  } catch (error) {
    console.error('Error al crear plantilla:', error);
    res.status(500).json({ ok: false, message: 'Error al crear plantilla' });
  }
});

// * Route to get a specific plantilla
router.get('/plantillas/:id', authToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('SELECT * FROM plantillas WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Plantilla no encontrada' });
    }

    const plantilla = {
      ...result.rows[0],
      variables: result.rows[0].variables || []
    };

    res.json({ ok: true, plantilla });
  } catch (error) {
    console.error('Error al obtener plantilla:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener plantilla' });
  }
});

// * Route to update a plantilla
router.put('/plantillas/:id', authToken, async (req, res) => {
  const { id } = req.params;
  const { name, description, content } = req.body;

  try {
    // Extract variables from content
    const variableRegex = /\{([^}]+)\}/g;
    const variables = [];
    let match;
    
    while ((match = variableRegex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    const query = `
      UPDATE plantillas 
      SET name = $1, description = $2, content = $3, variables = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    const values = [name, description, content, JSON.stringify(variables), id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Plantilla no encontrada' });
    }

    const plantilla = {
      ...result.rows[0],
      variables: variables
    };

    res.json({
      ok: true,
      message: 'Plantilla actualizada correctamente',
      plantilla
    });
  } catch (error) {
    console.error('Error al actualizar plantilla:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar plantilla' });
  }
});

// * Route to delete a plantilla
router.delete('/plantillas/:id', authToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Check if plantilla is being used in diligencias
    const usageResult = await pool.query('SELECT COUNT(*) FROM diligencias WHERE plantilla_id = $1', [id]);
    
    if (parseInt(usageResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        ok: false, 
        message: 'No se puede eliminar la plantilla porque está siendo usada en diligencias' 
      });
    }

    const result = await pool.query('DELETE FROM plantillas WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Plantilla no encontrada' });
    }

    res.json({ ok: true, message: 'Plantilla eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar plantilla:', error);
    res.status(500).json({ ok: false, message: 'Error al eliminar plantilla' });
  }
});

// ==================== RUTAS PARA DILIGENCIAS ====================

// * Route to get diligencias of an atestado
router.get('/atestados/:id/diligencias', authToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        p.name as plantilla_nombre,
        p.content as plantilla_content,
        json_agg(
          json_build_object(
            'variable', dv.variable,
            'valor', dv.valor
          )
        ) as valores
      FROM diligencias d
      JOIN plantillas p ON d.plantilla_id = p.id
      LEFT JOIN diligencia_valores dv ON d.id = dv.diligencia_id
      WHERE d.atestado_id = $1
      GROUP BY d.id, p.name, p.content
      ORDER BY d.orden, d.created_at
    `, [id]);

    res.json({ ok: true, diligencias: result.rows });
  } catch (error) {
    console.error('Error al obtener diligencias:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener diligencias' });
  }
});

// * Route to create a new diligencia in an atestado
router.post('/atestados/:id/diligencias', authToken, async (req, res) => {
  const { id: atestadoId } = req.params;
  const { templateId, values, previewText } = req.body;

  if (!templateId || !Array.isArray(values)) {
    return res.status(400).json({ ok: false, message: 'Template ID y valores son obligatorios' });
  }

  try {
    await pool.query('BEGIN');

    // Verify atestado exists
    const atestadoResult = await pool.query('SELECT id FROM atestados WHERE id = $1', [atestadoId]);
    if (atestadoResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Atestado no encontrado' });
    }

    // Verify plantilla exists
    const plantillaResult = await pool.query('SELECT id FROM plantillas WHERE id = $1', [templateId]);
    if (plantillaResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Plantilla no encontrada' });
    }

    // Get the next order number for this atestado
    const orderResult = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) + 1 as next_order FROM diligencias WHERE atestado_id = $1',
      [atestadoId]
    );
    const nextOrder = orderResult.rows[0].next_order;

    // Create diligencia
    const diligenciaQuery = `
      INSERT INTO diligencias (atestado_id, plantilla_id, texto_final, orden)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const diligenciaValues = [atestadoId, templateId, previewText, nextOrder];
    const diligenciaResult = await pool.query(diligenciaQuery, diligenciaValues);
    const diligenciaId = diligenciaResult.rows[0].id;

    // Insert variable values
    for (const { variable, value } of values) {
      if (variable && value) {
        await pool.query(
          'INSERT INTO diligencia_valores (diligencia_id, variable, valor) VALUES ($1, $2, $3)',
          [diligenciaId, variable, value]
        );
      }
    }

    await pool.query('COMMIT');

    res.status(201).json({
      ok: true,
      message: 'Diligencia creada correctamente',
      diligencia: diligenciaResult.rows[0]
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error al crear diligencia:', error);
    res.status(500).json({ ok: false, message: 'Error al crear diligencia' });
  }
});

// * Route to get a specific diligencia
router.get('/diligencias/:id', authToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        p.name as plantilla_nombre,
        p.content as plantilla_content,
        p.variables as plantilla_variables,
        json_agg(
          json_build_object(
            'variable', dv.variable,
            'valor', dv.valor
          )
        ) as valores
      FROM diligencias d
      JOIN plantillas p ON d.plantilla_id = p.id
      LEFT JOIN diligencia_valores dv ON d.id = dv.diligencia_id
      WHERE d.id = $1
      GROUP BY d.id, p.name, p.content, p.variables
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Diligencia no encontrada' });
    }

    const diligencia = {
      ...result.rows[0],
      plantilla_variables: result.rows[0].plantilla_variables || []
    };

    res.json({ ok: true, diligencia });
  } catch (error) {
    console.error('Error al obtener diligencia:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener diligencia' });
  }
});

// * Route to update a diligencia
router.put('/diligencias/:id', authToken, async (req, res) => {
  const { id } = req.params;
  const { values, previewText } = req.body;

  if (!Array.isArray(values)) {
    return res.status(400).json({ ok: false, message: 'Valores son obligatorios' });
  }

  try {
    await pool.query('BEGIN');

    // Update diligencia
    const diligenciaQuery = `
      UPDATE diligencias 
      SET texto_final = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const diligenciaResult = await pool.query(diligenciaQuery, [previewText, id]);

    if (diligenciaResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Diligencia no encontrada' });
    }

    // Delete existing values
    await pool.query('DELETE FROM diligencia_valores WHERE diligencia_id = $1', [id]);

    // Insert new values
    for (const { variable, value } of values) {
      if (variable) {
        await pool.query(
          'INSERT INTO diligencia_valores (diligencia_id, variable, valor) VALUES ($1, $2, $3)',
          [id, variable, value || '']
        );
      }
    }

    await pool.query('COMMIT');

    res.json({
      ok: true,
      message: 'Diligencia actualizada correctamente',
      diligencia: diligenciaResult.rows[0]
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error al actualizar diligencia:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar diligencia' });
  }
});

// * Route to delete a diligencia
router.delete('/diligencias/:id', authToken, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM diligencias WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Diligencia no encontrada' });
    }

    res.json({ ok: true, message: 'Diligencia eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar diligencia:', error);
    res.status(500).json({ ok: false, message: 'Error al eliminar diligencia' });
  }
});

// * Route to reorder diligencias in an atestado
router.put('/atestados/:id/diligencias/reorder', authToken, async (req, res) => {
  const { id: atestadoId } = req.params;
  const { diligenciasOrder } = req.body; // Array of { id, orden }

  if (!Array.isArray(diligenciasOrder)) {
    return res.status(400).json({ ok: false, message: 'diligenciasOrder debe ser un array' });
  }

  try {
    await pool.query('BEGIN');

    // Verify atestado exists
    const atestadoResult = await pool.query('SELECT id FROM atestados WHERE id = $1', [atestadoId]);
    if (atestadoResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Atestado no encontrado' });
    }

    // Update order for each diligencia
    for (const { id: diligenciaId, orden } of diligenciasOrder) {
      await pool.query(
        'UPDATE diligencias SET orden = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND atestado_id = $3',
        [orden, diligenciaId, atestadoId]
      );
    }

    await pool.query('COMMIT');

    res.json({
      ok: true,
      message: 'Orden de diligencias actualizado correctamente'
    });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error al reordenar diligencias:', error);
    res.status(500).json({ ok: false, message: 'Error al reordenar diligencias' });
  }
});

// * Route to get atestados count
router.get('/atestados/stats/count', authToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN estado = 'activo' THEN 1 END) as activos,
        COUNT(CASE WHEN estado = 'cerrado' THEN 1 END) as cerrados
      FROM atestados
    `);
    
    res.json({ ok: true, stats: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener estadísticas de atestados:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener estadísticas' });
  }
});

export default router;
