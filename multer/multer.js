import multer from 'multer';
import fs from 'fs';

const persistentPath = '/mnt/data/uploads';
const tempPath = '/mnt/data/temp';


[persistentPath, tempPath].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  } else {
    try {
      fs.chmodSync(dir, 0o755);
      console.log(`Permisos de ${dir} ajustados correctamente`);
    } catch (err) {
      console.error(`Error al cambiar permisos de ${dir}:`, err);
    }
  }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, tempPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Solo se permiten archivos de imagen'), false);
};

const upload = multer({ storage, fileFilter });

export { upload, persistentPath, tempPath };