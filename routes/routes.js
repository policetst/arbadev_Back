import express from 'express';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import pool from '../db/db.js';
import { upload, persistentPath } from '../multer/multer.js';
import { add_people, add_vehicle } from '../functions.js';

const router = express.Router();

// * Route to upload image
router.post('/upload', upload.single('file'), async (req, res) => {
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
router.get('/db', async (req, res) => {
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
router.get('/incidents', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM incidents');
    res.json({ ok: true, incidents: result.rows });
  } catch (error) {
    console.error('Error al obtener las incidencias:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener las incidencias' });
  }
});

// * Route to create an incident
router.post('/incidents', async (req, res) => {
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

  console.log(req.body);

  // * Validate required data
  if (!status || !location || !type || !description || brigade_field === undefined || !creator_user_code) {
    return res.status(400).json({ ok: false, message: 'Faltan datos obligatorios' });
  }

  try {
    await pool.query('BEGIN');

    const query = `
      INSERT INTO incidents (creation_date, status, location, type, description, brigade_field, creator_user_code)
      VALUES (NOW(), $1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [status, location, type, description, brigade_field, creator_user_code];
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
        const license_plate = vehicle.matricula;
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
router.put('/incidents/:code/', async (req, res) => {
  const { code } = req.params;
  const { status, location, type, description, people = [], vehicles = [], images, closure_user_code } = req.body;

  try {
    await pool.query('BEGIN');

    // Update incident basic info
    let query, values;
    
    if (status === 'Closed' && closure_user_code) {
      query = `
        UPDATE incidents SET status = $1, location = $2, type = $3, description = $4, closure_user_code = $5
        WHERE code = $6;
      `;
      values = [status, location, type, description, closure_user_code, code];
    } else {
      query = `
        UPDATE incidents SET status = $1, location = $2, type = $3, description = $4
        WHERE code = $5;
      `;
      values = [status, location, type, description, code];
    }
    
    await pool.query(query, values);

    // Update people: First remove existing relationships
    await pool.query('DELETE FROM incidents_people WHERE incident_code = $1', [code]);
    
    // Add updated people relationships
    if (Array.isArray(people) && people.length > 0) {
      for (const person of people) {
        await add_people(person); // Ensure person exists in people table
        const dni = person.dni;
        await pool.query(
          `INSERT INTO incidents_people (incident_code, person_dni) VALUES ($1, $2);`,
          [code, dni]
        );
      }
    }

    // Update vehicles: First remove existing relationships
    await pool.query('DELETE FROM incidents_vehicles WHERE incident_code = $1', [code]);
    
    // Add updated vehicle relationships
    if (Array.isArray(vehicles) && vehicles.length > 0) {
      for (const vehicle of vehicles) {
        await add_vehicle(vehicle); // Ensure vehicle exists in vehicles table
        const license_plate = vehicle.matricula;
        await pool.query(
          `INSERT INTO incidents_vehicles (incident_code, vehicle_license_plate) VALUES ($1, $2);`,
          [code, license_plate]
        );
      }
    }

    // Handle images if needed
    if (Array.isArray(images) && images.length > 0) {
      // Optionally: delete existing images
      // await pool.query('DELETE FROM incident_images WHERE incident_code = $1', [code]);
      
      for (const image of images) {
        await pool.query(
          `INSERT INTO incident_images (incident_code, url) VALUES ($1, $2) 
           ON CONFLICT (incident_code, url) DO NOTHING;`, // Prevent duplicates
          [code, image]
        );
      }
    }

    await pool.query('COMMIT');
    res.json({ ok: true, message: 'Incident updated successfully' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error al actualizar la incidencia:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar la incidencia' });
  }
});

export default router;
