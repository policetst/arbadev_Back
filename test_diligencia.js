import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

// Cargar variables de entorno
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://arbadev_bbdd_test_user:${process.env.DB_PASSWORD}@${process.env.DB_URL}`,
  ssl: { rejectUnauthorized: false }
});

async function testDiligenciaCreation() {
  try {
    console.log('🧪 Probando la creación de una diligencia...');
    
    // Datos de prueba
    const atestadoId = 9; // Usar un atestado existente
    const templateId = 8; // Usar una plantilla existente (Trafico)
    const previewText = 'La persona Juan Pérez con el vehiculo ABC-123 tuvo un accidente de tráfico.';
    const values = [
      { variable: 'nombre', value: 'Juan Pérez' },
      { variable: 'plate', value: 'ABC-123' }
    ];
    
    console.log('📝 Datos de prueba:');
    console.log('  Atestado ID:', atestadoId);
    console.log('  Template ID:', templateId);
    console.log('  Preview Text:', previewText);
    console.log('  Values:', values);
    
    // Verificar que el atestado existe
    const atestadoResult = await pool.query('SELECT id FROM atestados WHERE id = $1', [atestadoId]);
    if (atestadoResult.rows.length === 0) {
      console.log('❌ Atestado no encontrado');
      return;
    }
    console.log('✅ Atestado encontrado');
    
    // Verificar que la plantilla existe
    const plantillaResult = await pool.query('SELECT id FROM plantillas WHERE id = $1', [templateId]);
    if (plantillaResult.rows.length === 0) {
      console.log('❌ Plantilla no encontrada');
      return;
    }
    console.log('✅ Plantilla encontrada');
    
    // Obtener el siguiente número de orden
    const orderResult = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) + 1 as next_order FROM diligencias WHERE atestado_id = $1',
      [atestadoId]
    );
    const nextOrder = orderResult.rows[0].next_order;
    console.log('📊 Siguiente orden:', nextOrder);
    
    // Iniciar transacción
    await pool.query('BEGIN');
    
    // Crear diligencia
    const diligenciaQuery = `
      INSERT INTO diligencias (atestado_id, plantilla_id, texto_final, orden)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const diligenciaValues = [atestadoId, templateId, previewText || '', nextOrder];
    const diligenciaResult = await pool.query(diligenciaQuery, diligenciaValues);
    const diligenciaId = diligenciaResult.rows[0].id;
    
    console.log('✅ Diligencia creada con ID:', diligenciaId);
    
    // Insertar valores de variables
    for (const { variable, value } of values) {
      if (variable && value) {
        await pool.query(
          'INSERT INTO diligencia_valores (diligencia_id, variable, valor) VALUES ($1, $2, $3)',
          [diligenciaId, variable, value]
        );
        console.log(`  ✅ Variable agregada: ${variable} = ${value}`);
      }
    }
    
    await pool.query('COMMIT');
    console.log('✅ Transacción completada exitosamente');
    
    // Verificar la diligencia creada
    const verifyResult = await pool.query(`
      SELECT 
        d.*,
        p.name as plantilla_nombre,
        COALESCE(
          json_agg(
            json_build_object(
              'variable', dv.variable,
              'valor', dv.valor
            )
          ) FILTER (WHERE dv.variable IS NOT NULL),
          '[]'::json
        ) as valores
      FROM diligencias d
      JOIN plantillas p ON d.plantilla_id = p.id
      LEFT JOIN diligencia_valores dv ON d.id = dv.diligencia_id
      WHERE d.id = $1
      GROUP BY d.id, p.name
    `, [diligenciaId]);
    
    console.log('🔍 Diligencia verificada:');
    const diligencia = verifyResult.rows[0];
    console.log('  ID:', diligencia.id);
    console.log('  Atestado ID:', diligencia.atestado_id);
    console.log('  Plantilla:', diligencia.plantilla_nombre);
    console.log('  Texto final:', diligencia.texto_final);
    console.log('  Orden:', diligencia.orden);
    console.log('  Valores:', diligencia.valores);
    
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

testDiligenciaCreation();