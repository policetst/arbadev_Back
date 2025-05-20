import pool from './db/db.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

// La lista de códigos de usuario para crear
const userCodes = [
  'AR01492',
  'AR01491',
  'AR01490',
  'AR01489',
  'AR01487',
  'AR01646',
  'AR01627',
  'AR01618',
  'AR01453',
  'AR01103'
];

// Contraseña por defecto para los usuarios (puede personalizarla)
const defaultPassword = 'Arba2024';

// Función para crear un usuario con contraseña hasheada
const createUser = async (userCode) => {
  try {
    // Generar hash de la contraseña con salt de 10 rounds
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(defaultPassword, salt);
    
    // Generar un email a partir del código (puede personalizarse según sea necesario)
    const email = `${userCode.toLowerCase()}@arbadev.com`;
    
    // Insertar el usuario en la tabla
    const query = `
      INSERT INTO users (code, email, password, role, status)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (code) 
      DO UPDATE SET password = $3
      RETURNING code;
    `;
    
    // Usar los valores correctos: 'Standard' para role y 'Active' para status
    const values = [userCode, email, hashedPassword, 'Standard', 'Active'];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error(`Error al crear el usuario ${userCode}:`, error);
    throw error;
  }
};

// Función principal
const main = async () => {
  try {
    await pool.query('BEGIN');
    
    // Comprobar si existe la tabla de usuarios, si no, crearla
    const checkTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `;
    
    const tableExists = await pool.query(checkTableQuery);
    
    // Si la tabla no existe, la creamos
    if (!tableExists.rows[0].exists) {
      console.log('Creando tabla de usuarios...');
      
      const createTableQuery = `
        CREATE TABLE users (
          code VARCHAR(50) PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          password VARCHAR(255) NOT NULL,
          role VARCHAR(50) CHECK (role IN ('Standard', 'Administrator')) NOT NULL,
          status VARCHAR(50) CHECK (status IN ('Active', 'Inactive')) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      
      await pool.query(createTableQuery);
    }
    
    console.log('Creando usuarios...');
    
    // Crear cada usuario
    for (const userCode of userCodes) {
      const user = await createUser(userCode);
      console.log(`Usuario creado: ${user.code}`);
    }
    
    await pool.query('COMMIT');
    console.log('Todos los usuarios han sido creados con éxito.');
    console.log(`Contraseña por defecto: ${defaultPassword}`);
    
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error al crear los usuarios:', error);
  } finally {
    // Cerrar la conexión a la base de datos
    pool.end();
  }
};

// Ejecutar función principal
main(); 