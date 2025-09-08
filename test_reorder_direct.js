// Script para probar directamente la lógica de reordenamiento sin HTTP
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testReorderLogic() {
  try {
    console.log('🚀 Iniciando test directo de reordenamiento...');
    
    // 1. Buscar un atestado con múltiples diligencias
    console.log('📋 Buscando atestado con múltiples diligencias...');
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
    const atestadoId = atestado.id;
    console.log(`✅ Usando atestado ${atestado.numero} (ID: ${atestadoId}) con ${atestado.total_diligencias} diligencias`);

    // 2. Obtener el orden actual de las diligencias
    const currentOrderResult = await pool.query(`
      SELECT id, orden, texto_final
      FROM diligencias 
      WHERE atestado_id = $1 
      ORDER BY orden, created_at
    `, [atestadoId]);

    console.log('\n📋 Orden actual de diligencias:');
    currentOrderResult.rows.forEach((diligencia, index) => {
      console.log(`  ${index + 1}. ID: ${diligencia.id}, Orden: ${diligencia.orden}, Texto: ${diligencia.texto_final?.substring(0, 50)}...`);
    });

    // 3. Crear un nuevo orden (invertir el orden)
    const diligenciasOrder = currentOrderResult.rows.reverse().map((diligencia, index) => ({
      id: diligencia.id,
      orden: index + 1
    }));

    console.log('\n🔄 Nuevo orden propuesto:');
    diligenciasOrder.forEach((item, index) => {
      console.log(`  ${index + 1}. ID: ${item.id}, Nuevo orden: ${item.orden}`);
    });

    // 4. Implementar la lógica de reordenamiento (igual que en routes.js)
    console.log('\n🔧 Ejecutando lógica de reordenamiento...');
    
    // Logs de depuración (igual que en routes.js)
    console.log('🔍 DEBUG - Reordenando diligencias:');
    console.log('🆔 atestadoId:', atestadoId, 'tipo:', typeof atestadoId);
    console.log('📋 diligenciasOrder completo:', JSON.stringify(diligenciasOrder, null, 2));
    console.log('📊 diligenciasOrder es array:', Array.isArray(diligenciasOrder));
    console.log('📏 diligenciasOrder longitud:', diligenciasOrder.length);

    // Validaciones
    if (!Array.isArray(diligenciasOrder)) {
      console.log('❌ ERROR: diligenciasOrder no es un array');
      return;
    }

    if (diligenciasOrder.length === 0) {
      console.log('❌ ERROR: diligenciasOrder está vacío');
      return;
    }

    // Validar estructura de cada elemento
    for (const item of diligenciasOrder) {
      if (!item.id || typeof item.orden !== 'number') {
        console.log('❌ ERROR: Elemento inválido en diligenciasOrder:', item);
        return;
      }
    }
    console.log('✅ Validaciones pasadas');

    // Iniciar transacción
    await pool.query('BEGIN');
    console.log('🚀 Iniciando transacción...');

    // Verificar que el atestado existe
    const atestadoResult = await pool.query('SELECT id FROM atestados WHERE id = $1', [atestadoId]);
    if (atestadoResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      console.log('❌ Atestado no encontrado:', atestadoId);
      return;
    }
    console.log('✅ Atestado encontrado:', atestadoId);

    // Verificar que todas las diligencias pertenecen al atestado
    const diligenciaIds = diligenciasOrder.map(item => item.id);
    const existingDiligencias = await pool.query(
      'SELECT id FROM diligencias WHERE id = ANY($1) AND atestado_id = $2',
      [diligenciaIds, atestadoId]
    );

    if (existingDiligencias.rows.length !== diligenciasOrder.length) {
      await pool.query('ROLLBACK');
      console.log('❌ Algunas diligencias no pertenecen al atestado o no existen');
      console.log('Esperadas:', diligenciaIds);
      console.log('Encontradas:', existingDiligencias.rows.map(row => row.id));
      return;
    }
    console.log('✅ Todas las diligencias pertenecen al atestado');

    // Actualizar el orden de cada diligencia
    let updatedCount = 0;
    for (const { id: diligenciaId, orden } of diligenciasOrder) {
      console.log(`🔄 Actualizando diligencia ${diligenciaId} con orden ${orden}`);
      const updateResult = await pool.query(
        'UPDATE diligencias SET orden = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND atestado_id = $3',
        [orden, diligenciaId, atestadoId]
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

    // Verificar el resultado final
    const finalResult = await pool.query(
      'SELECT id, orden, texto_final FROM diligencias WHERE atestado_id = $1 ORDER BY orden',
      [atestadoId]
    );
    console.log('\n📋 Orden final en la base de datos:');
    finalResult.rows.forEach((diligencia, index) => {
      console.log(`  ${index + 1}. ID: ${diligencia.id}, Orden: ${diligencia.orden}, Texto: ${diligencia.texto_final?.substring(0, 50)}...`);
    });

    console.log('\n✅ Test completado exitosamente');

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Error durante el test:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await pool.end();
  }
}

// Ejecutar el test
testReorderLogic();