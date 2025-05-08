import express from 'express';
import cors from 'cors';
import { persistentPath } from './multer/multer.js';
import router from './routes/routes.js';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Servir las imágenes desde el disco persistente
app.use('/files', express.static(persistentPath));

// Usar las rutas
app.use('/', router);

app.listen(port, () => {
  console.log(` server running on port ${port}`);
});