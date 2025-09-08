// Test script para verificar el reordenamiento de diligencias
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function testReorderDiligencias() {
  try {
    console.log('🚀 Iniciando test de reordenamiento de diligencias...');
    
    // 1. Buscar un atestado con múltiples diligencias
    const atestadosResult = await pool.query(`
      SELECT a.id, a.numero, COUNT(d.id) as total_diligencias
      FROM atestados a
      LEFT JOIN diligencias d ON a.id = d.atestado_id
      GROUP BY a.id, a.numero
      HAVING COUNT(d.id) > 1
      ORDER BY COUNT(d.id) DESC
      LIMIT 1
    `);

    if (atestadosResult.rows.length === 0) {
      console.log('❌ No se encontraron atestados con múltiples diligencias');
      return;
    }

    const atestado = atestadosResult.rows[0];
    console.log(`✅ Usando atestado ${atestado.numero} (ID: ${atestado.id}) con ${atestado.total_diligencias} diligencias`);

    // 2. Obtener el orden actual de las diligencias
    const currentOrderResult = await pool.query(`
      SELECT id, orden, texto_final, created_at
      FROM diligencias 
      WHERE atestado_id = $1 
      ORDER BY orden, created_at
    `, [atestado.id]);

    console.log('\n📋 Orden actual de diligencias:');
    currentOrderResult.rows.forEach((diligencia, index) => {
      console.log(`  ${index + 1}. ID: ${diligencia.id}, Orden: ${diligencia.orden}, Texto: ${diligencia.texto_final?.substring(0, 50)}...`);
    });

    // 3. Crear un nuevo orden (invertir el orden)
    const newOrder = currentOrderResult.rows.reverse().map((diligencia, index) => ({
      id: diligencia.id,
      orden: index + 1
    }));

    console.log('\n🔄 Nuevo orden propuesto:');
    newOrder.forEach((item, index) => {
      console.log(`  ${index + 1}. ID: ${item.id}, Nuevo orden: ${item.orden}`);
    });

    // 4. Aplicar el reordenamiento usando transacción
    await pool.query('BEGIN');
    console.log('\n🚀 Iniciando transacción de reordenamiento...');

    let updatedCount = 0;
    for (const { id: diligenciaId, orden } of newOrder) {
      console.log(`🔄 Actualizando diligencia ${diligenciaId} con orden ${orden}`);
      const updateResult = await pool.query(
        'UPDATE diligencias SET orden = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND atestado_id = $3',
        [orden, diligenciaId, atestado.id]
      );

      if (updateResult.rowCount === 0) {
        console.log(`❌ No se pudo actualizar diligencia ${diligenciaId}`);
        await pool.query('ROLLBACK');
        return;
      }
      updatedCount++;
      console.log(`✅ Diligencia ${diligenciaId} actualizada correctamente`);
    }

    await pool.query('COMMIT');
    console.log(`🎉 Transacción completada. ${updatedCount} diligencias actualizadas`);

    // 5. Verificar el resultado final
    const finalResult = await pool.query(`
      SELECT id, orden, texto_final, updated_at
      FROM diligencias 
      WHERE atestado_id = $1 
      ORDER BY orden
    `, [atestado.id]);

    console.log('\n📋 Orden final después del reordenamiento:');
    finalResult.rows.forEach((diligencia, index) => {
      console.log(`  ${index + 1}. ID: ${diligencia.id}, Orden: ${diligencia.orden}, Texto: ${diligencia.texto_final?.substring(0, 50)}...`);
    });

    console.log('\n✅ Test de reordenamiento completado exitosamente');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Error durante el test:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await pool.end();
  }
}

// Ejecutar el test
testReorderDiligencias();