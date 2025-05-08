import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;
dotenv.config();

const pool = new Pool({
  connectionString: `postgresql://arbadev:${process.env.DB_PASSWORD}@${process.env.DB_URL}`,
  ssl: { rejectUnauthorized: false },
});

export default pool;
