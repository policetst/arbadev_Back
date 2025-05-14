import express from 'express';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import pool from '../db/db.js';
import { upload, persistentPath } from '../multer/multer.js';
import { log } from 'console';

const router = express.Router();

// * ruta para subir imagen


router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ stat: "error", message: "No se subió ningún archivo" });
  }

  try {
    const outputFilename = 'img-' + req.file.filename;
    const outputPath = path.join(persistentPath, outputFilename); 

    await sharp(req.file.path)
      .resize({ width: 1200, height: 1200, fit: sharp.fit.inside, withoutEnlargement: true }) //! Redimensionar la imagen
      .jpeg({ quality: 80 })
      .toFile(outputPath);

    fs.unlinkSync(req.file.path); 

    const fileUrl = `${req.protocol}://${req.get('host')}/files/${outputFilename}`; // * recogerr la url de la imagen 

    res.json({ //!devolver informacion de la imagen
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

// * Ruta para test de base de datos


router.get('/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send({ ok: true, time: result.rows[0].now });
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
    res.status(500).send({ ok: false, error: 'Error al conectar con la base de datos' });
  }
});

// *ruta get básica


router.get('/', (req, res) => {
  res.send({ ok: true, res: 'Hello Arba Dev!' });
});
// * ruta para crear una incidencia


router.post('/incidents', async (req, res) => {
  const { status, location, type, description, brigade_field, creator_user_code } = req.body; // * desectructurar los datos del body de la peticion
  console.log(req.body); //* log debug
  
///! validar los datos obligatorios
  if (!status || !location || !type || !description || brigade_field === undefined || !creator_user_code) {
    return res.status(400).json({ ok: false, message: 'Faltan datos obligatorios' });
  }

  try {
    const query = `
      INSERT INTO incidents (creation_date, status, location, type, description, brigade_field, creator_user_code)
      VALUES (NOW(), $1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    const values = [status, location, type, description, brigade_field, creator_user_code];
//** ejecutar la consulta
    const result = await pool.query(query, values);

    res.status(201).json({
      ok: true,
      message: `Incidencia creada exitosamente`,
      incident: result.rows[0],
    });
  } catch (error) {
    console.error('Error al insertar el incidente:', error);
    res.status(500).json({ ok: false, message: 'Error al insertar el incidente' });
  }
});

export default router;