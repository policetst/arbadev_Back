import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { persistentPath } from './multer/multer.js';
import Peoplerouter from './routes/personRouter.js';
import router from './routes/routes.js';
// import vehiclesRouter from './routes/vehicles.js';

// Cargar variables de entorno
dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

//! Exponer archivos estáticos desde la carpeta uploads
app.use('/files', express.static(persistentPath));

//* Cargar rutas en /
app.use('/', router);
app.use('/people', Peoplerouter)

// app.use('/vehicles', vehiclesRouter);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
export default app;