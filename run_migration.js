import pkg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

const { Pool } = pkg;

// Cargar variables de entorno
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://arbadev_bbdd_test_user:${process.env.DB_PASSWORD}@${process.env.DB_URL}`,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('🔧 Ejecutando migración para agregar campo orden...');
    
    const migrationSQL = fs.readFileSync('../infraestructure/db/migration_add_orden_diligencias.sql', 'utf8');
    await pool.query(migrationSQL);
    console.log('✅ Migración ejecutada correctamente');
    
    // Verificar que el campo orden existe ahora
    const result = await pool.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'diligencias' AND column_name = 'orden'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Campo orden agregado:', result.rows[0]);
    } else {
      console.log('❌ Campo orden aún no encontrado');
    }
    
    // Verificar algunas diligencias después de la migración
    const diligenciasResult = await pool.query(`
      SELECT d.id, d.atestado_id, d.orden, d.texto_final, d.created_at,
             p.name as plantilla_nombre
      FROM diligencias d
      LEFT JOIN plantillas p ON d.plantilla_id = p.id
      ORDER BY d.atestado_id, d.orden 
      LIMIT 5
    `);
    
    console.log('📋 Diligencias después de la migración:');
    if (diligenciasResult.rows.length === 0) {
      console.log('  No hay diligencias en la base de datos');
    } else {
      diligenciasResult.rows.forEach(row => {
        console.log(`  ID: ${row.id}, Atestado: ${row.atestado_id}, Orden: ${row.orden}, Plantilla: ${row.plantilla_nombre}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

runMigration();