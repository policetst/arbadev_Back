import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;
//!  cargar las variables de entorno
dotenv.config();
// * crear la conexion a la base de datos
const pool = new Pool({
  connectionString: `postgresql://arbadev:${process.env.DB_PASSWORD}@${process.env.DB_URL}`,
  ssl: { rejectUnauthorized: false }, // * para evitar el error del certificado no seguro
});

export default pool;
