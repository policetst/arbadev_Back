import express from 'express';
import cors from 'cors';
import { persistentPath } from './multer/multer.js';
import router from './routes/routes.js';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

//! exponer las imagenes desde el disco persistente
app.use('/files', express.static(persistentPath));

//* Cagar las rutas del router desde /
app.use('/', router);

app.listen(port, () => {
  console.log(` server running on port ${port}`);
});