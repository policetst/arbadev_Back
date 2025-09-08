// Script para probar el endpoint de reordenamiento de diligencias
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const API_BASE_URL = 'http://localhost:4000';

// Función para obtener un token válido (simulado)
function getTestToken() {
  // En un entorno real, necesitarías un token JWT válido
  // Para pruebas, puedes generar uno temporal o usar uno existente
  return 'Bearer tu_token_aqui'; // Reemplazar con un token válido
}

async function testReorderEndpoint() {
  try {
    console.log('🚀 Iniciando test del endpoint de reordenamiento...');
    
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
      console.log('💡 Creando datos de prueba...');
      await createTestData();
      return;
    }

    const atestado = atestadosResult.rows[0];
    console.log(`✅ Usando atestado ${atestado.numero} (ID: ${atestado.id}) con ${atestado.total_diligencias} diligencias`);

    // 2. Obtener el orden actual de las diligencias
    const currentOrderResult = await pool.query(`
      SELECT id, orden, texto_final
      FROM diligencias 
      WHERE atestado_id = $1 
      ORDER BY orden, created_at
    `, [atestado.id]);

    console.log('\n📋 Orden actual de diligencias:');
    currentOrderResult.rows.forEach((diligencia, index) => {
      console.log(`  ${index + 1}. ID: ${diligencia.id}, Orden: ${diligencia.orden}`);
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

    // 4. Probar el endpoint
    console.log('\n🌐 Probando endpoint HTTP...');
    const token = getTestToken();
    
    const requestData = {
      diligenciasOrder: newOrder
    };
    
    console.log('📤 Datos a enviar:', JSON.stringify(requestData, null, 2));
    
    try {
      const response = await axios.put(
        `${API_BASE_URL}/atestados/${atestado.id}/reorder-diligencias`,
        requestData,
        {
          headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✅ Respuesta exitosa del endpoint:');
      console.log(JSON.stringify(response.data, null, 2));
      
    } catch (httpError) {
      console.error('❌ Error HTTP:', httpError.response?.status);
      console.error('📄 Mensaje:', httpError.response?.data?.message || httpError.message);
      console.error('📋 Datos completos:', httpError.response?.data);
      
      if (httpError.response?.status === 401 || httpError.response?.status === 403) {
        console.log('💡 Nota: Necesitas un token JWT válido para probar el endpoint');
        console.log('💡 Puedes obtener uno haciendo login en la aplicación');
      }
    }

    // 5. Verificar el resultado en la base de datos
    console.log('\n🔍 Verificando resultado en la base de datos...');
    const finalResult = await pool.query(`
      SELECT id, orden, texto_final
      FROM diligencias 
      WHERE atestado_id = $1 
      ORDER BY orden
    `, [atestado.id]);

    console.log('📋 Orden final en la base de datos:');
    finalResult.rows.forEach((diligencia, index) => {
      console.log(`  ${index + 1}. ID: ${diligencia.id}, Orden: ${diligencia.orden}`);
    });

  } catch (error) {
    console.error('❌ Error durante el test:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await pool.end();
  }
}

async function createTestData() {
  try {
    console.log('🏗️ Creando datos de prueba...');
    
    // Crear un atestado de prueba
    const atestadoResult = await pool.query(`
      INSERT INTO atestados (numero, fecha, descripcion, estado, created_at, updated_at)
      VALUES ('TEST-001', CURRENT_DATE, 'Atestado de prueba para reordenamiento', 'Abierto', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, numero
    `);
    
    const atestadoId = atestadoResult.rows[0].id;
    console.log(`✅ Atestado creado: ${atestadoResult.rows[0].numero} (ID: ${atestadoId})`);
    
    // Crear algunas diligencias de prueba
    const diligencias = [
      'Primera diligencia de prueba',
      'Segunda diligencia de prueba', 
      'Tercera diligencia de prueba'
    ];
    
    for (let i = 0; i < diligencias.length; i++) {
      await pool.query(`
        INSERT INTO diligencias (atestado_id, texto_final, orden, created_at, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [atestadoId, diligencias[i], i + 1]);
    }
    
    console.log(`✅ ${diligencias.length} diligencias creadas`);
    console.log('💡 Ejecuta el script nuevamente para probar el reordenamiento');
    
  } catch (error) {
    console.error('❌ Error creando datos de prueba:', error);
  }
}

// Ejecutar el test
testReorderEndpoint();