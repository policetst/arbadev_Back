// Crear usuario de prueba para testing
import bcrypt from 'bcrypt';
import pkg from 'pg';
const { Pool } = pkg;

// Configuración de la base de datos
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function createTestUser() {
  try {
    console.log('🚀 Creando usuario de prueba...');
    
    // Hash de la contraseña
    const password = 'test123';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insertar usuario
    const query = `
      INSERT INTO users (codigo, password, rol, estado, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (codigo) DO UPDATE SET
        password = EXCLUDED.password,
        updated_at = NOW()
      RETURNING codigo, rol, estado;
    `;
    
    const values = ['TEST001', hashedPassword, 'Standard', 'Active'];
    const result = await pool.query(query, values);
    
    console.log('✅ Usuario creado/actualizado:');
    console.log('   Código:', result.rows[0].codigo);
    console.log('   Contraseña:', password);
    console.log('   Rol:', result.rows[0].rol);
    console.log('   Estado:', result.rows[0].estado);
    
    // Verificar que el usuario puede hacer login
    console.log('\n🔐 Verificando login...');
    const loginQuery = 'SELECT codigo, password, rol, estado FROM users WHERE codigo = $1';
    const loginResult = await pool.query(loginQuery, ['TEST001']);
    
    if (loginResult.rows.length > 0) {
      const user = loginResult.rows[0];
      const isValidPassword = await bcrypt.compare(password, user.password);
      console.log('✅ Usuario encontrado:', user.codigo);
      console.log('✅ Contraseña válida:', isValidPassword);
      console.log('✅ Estado:', user.estado);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

createTestUser();