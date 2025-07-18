import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

// Cargar variables de entorno
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://arbadev_bbdd_test_user:${process.env.DB_PASSWORD}@${process.env.DB_URL}`,
  ssl: { rejectUnauthorized: false }
});

async function checkDatabase() {
  try {
    console.log('🔍 Verificando estructura de la base de datos...');
    console.log('🔗 Conectando a:', process.env.DATABASE_URL ? 'DATABASE_URL' : `postgresql://arbadev_bbdd_test_user:***@${process.env.DB_URL}`);
    
    // Verificar conexión
    const testResult = await pool.query('SELECT NOW()');
    console.log('✅ Conexión exitosa:', testResult.rows[0].now);
    
    // Verificar que el campo orden existe
    const columnResult = await pool.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'diligencias' AND column_name = 'orden'
    `);
    
    if (columnResult.rows.length > 0) {
      console.log('✅ Campo orden encontrado:', columnResult.rows[0]);
    } else {
      console.log('❌ Campo orden no encontrado');
      return;
    }
    
    // Verificar algunas diligencias
    const diligenciasResult = await pool.query(`
      SELECT d.id, d.atestado_id, d.orden, d.texto_final, d.created_at,
             p.name as plantilla_nombre
      FROM diligencias d
      LEFT JOIN plantillas p ON d.plantilla_id = p.id
      ORDER BY d.atestado_id, d.orden 
      LIMIT 10
    `);
    
    console.log('📋 Diligencias de ejemplo:');
    if (diligenciasResult.rows.length === 0) {
      console.log('  No hay diligencias en la base de datos');
    } else {
      diligenciasResult.rows.forEach(row => {
        console.log(`  ID: ${row.id}, Atestado: ${row.atestado_id}, Orden: ${row.orden}, Plantilla: ${row.plantilla_nombre}`);
        console.log(`    Texto: ${row.texto_final ? row.texto_final.substring(0, 50) + '...' : 'Sin contenido'}`);
      });
    }
    
    // Verificar plantillas
    const plantillasResult = await pool.query(`
      SELECT id, name, content
      FROM plantillas
      LIMIT 5
    `);
    
    console.log('📝 Plantillas disponibles:');
    if (plantillasResult.rows.length === 0) {
      console.log('  No hay plantillas en la base de datos');
    } else {
      plantillasResult.rows.forEach(row => {
        console.log(`  ID: ${row.id}, Nombre: ${row.name}`);
        console.log(`    Contenido: ${row.content ? row.content.substring(0, 50) + '...' : 'Sin contenido'}`);
      });
    }
    
    // Verificar atestados
    const atestadosResult = await pool.query(`
      SELECT id, numero, descripcion
      FROM atestados
      LIMIT 5
    `);
    
    console.log('📄 Atestados disponibles:');
    if (atestadosResult.rows.length === 0) {
      console.log('  No hay atestados en la base de datos');
    } else {
      atestadosResult.rows.forEach(row => {
        console.log(`  ID: ${row.id}, Número: ${row.numero}, Descripción: ${row.descripcion}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

checkDatabase();