import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { persistentPath } from './multer/multer.js';
import router from './routes/routes.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

//! exposer static files from the uploads folder
app.use('/files', express.static(persistentPath));

//* load routes at /
app.use('/', router);

app.listen(port, () => {
  console.log(` server running on port ${port}`);
});