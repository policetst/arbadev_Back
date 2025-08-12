// test_reorder.js - Script para probar el reordenamiento de diligencias
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DB_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testReorder() {
  try {
    console.log('🔍 Probando reordenamiento de diligencias...');
    
    // Obtener un atestado con diligencias
    const atestadosResult = await pool.query(`
      SELECT a.id, a.numero, COUNT(d.id) as diligencias_count
      FROM atestados a
      LEFT JOIN diligencias d ON a.id = d.atestado_id
      GROUP BY a.id, a.numero
      HAVING COUNT(d.id) > 1
      LIMIT 1
    `);
    
    if (atestadosResult.rows.length === 0) {
      console.log('❌ No hay atestados con múltiples diligencias para probar');
      return;
    }
    
    const atestado = atestadosResult.rows[0];
    console.log(`✅ Usando atestado ${atestado.numero} (ID: ${atestado.id}) con ${atestado.diligencias_count} diligencias`);
    
    // Obtener diligencias actuales
    const diligenciasResult = await pool.query(`
      SELECT id, orden, texto_final
      FROM diligencias
      WHERE atestado_id = $1
      ORDER BY orden, created_at
    `, [atestado.id]);
    
    console.log('📋 Orden actual:');
    diligenciasResult.rows.forEach((d, i) => {
      console.log(`  ${i + 1}. ID: ${d.id}, Orden: ${d.orden}, Texto: ${d.texto_final?.substring(0, 50) || 'Sin contenido'}...`);
    });
    
    // Crear un nuevo orden (invertir el orden)
    const newOrder = diligenciasResult.rows.reverse().map((d, index) => ({
      id: d.id,
      orden: index + 1
    }));
    
    console.log('🔄 Nuevo orden a aplicar:');
    newOrder.forEach((item, i) => {
      console.log(`  ${i + 1}. ID: ${item.id}, Nuevo orden: ${item.orden}`);
    });
    
    // Simular la actualización
    await pool.query('BEGIN');
    
    for (const { id, orden } of newOrder) {
      await pool.query(
        'UPDATE diligencias SET orden = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [orden, id]
      );
    }
    
    await pool.query('COMMIT');
    console.log('✅ Reordenamiento aplicado');
    
    // Verificar el resultado
    const finalResult = await pool.query(`
      SELECT id, orden, texto_final
      FROM diligencias
      WHERE atestado_id = $1
      ORDER BY orden, created_at
    `, [atestado.id]);
    
    console.log('📋 Orden final:');
    finalResult.rows.forEach((d, i) => {
      console.log(`  ${i + 1}. ID: ${d.id}, Orden: ${d.orden}, Texto: ${d.texto_final?.substring(0, 50) || 'Sin contenido'}...`);
    });
    
    console.log('🎉 Prueba de reordenamiento completada exitosamente');
    
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Error en la prueba:', error);
  } finally {
    await pool.end();
  }
}

testReorder();