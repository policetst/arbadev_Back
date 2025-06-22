import multer from 'multer';
import fs from 'fs';
//*definir las rutas para manejar las imagenes
const persistentPath = '/mnt/data/uploads';
const tempPath = '/mnt/data/temp';

//! crear las carpetas si no existen con los permisos necesarios
[persistentPath, tempPath].forEach(dir => {
  if (!fs.existsSync(dir)) {
    // fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  } else {
    try {
      fs.chmodSync(dir, 0o755);
      console.log(`Permisos de ${dir} ajustados correctamente`);
    } catch (err) {
      console.error(`Error al cambiar permisos de ${dir}:`, err);
    }
  }
});
//* crear el espacio de almacenamiento temporal para las imagenes
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
//! solo permitir los archivos de imagenes
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Solo se permiten archivos de imagen'), false);
};
//? crear el middleware de multer para subir las imagenes
const upload = multer({ storage, fileFilter });

export { upload, persistentPath, tempPath };