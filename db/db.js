import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;
//!  cargar las variables de entorno
dotenv.config();
// * create
const pool = new Pool({
  connectionString: `postgresql://arbadev_bbdd_test_user:${process.env.DB_PASSWORD}@${process.env.DB_URL}`,
  ssl: { rejectUnauthorized: false }, // * para evitar el error del certificado no seguro
});

export default pool;
