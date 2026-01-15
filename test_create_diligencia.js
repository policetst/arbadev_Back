// test_create_diligencia.js
const axios = require('axios');

const API_BASE_URL = 'https://arbadev-back-joq0.onrender.com';

// Función para simular obtener token de cookie (en un entorno real)
function getTokenFromCookie() {
  // En un entorno real, esto obtendría el token de las cookies del navegador
  // Para pruebas, necesitarías un token válido
  return 'tu_token_jwt_aqui';
}

async function testCreateDiligencia() {
  try {
    console.log('🧪 Iniciando prueba de creación de diligencia...');
    
    const token = getTokenFromCookie();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Datos de prueba
    const atestadoId = 1; // ID de un atestado existente
    const diligenciaData = {
      templateId: 1, // ID de una plantilla existente
      values: [
        { variable: 'nombre', value: 'Juan Pérez' },
        { variable: 'fecha', value: '2024-01-15' }
      ],
      previewText: 'Diligencia de prueba con nombre: Juan Pérez y fecha: 2024-01-15'
    };

    console.log('📤 Enviando datos:', JSON.stringify(diligenciaData, null, 2));
    console.log('🎯 URL:', `${API_BASE_URL}/atestados/${atestadoId}/diligencias`);

    const response = await axios.post(
      `${API_BASE_URL}/atestados/${atestadoId}/diligencias`,
      diligenciaData,
      { headers }
    );

    console.log('✅ Respuesta exitosa:', response.data);
    console.log('📊 Status:', response.status);

  } catch (error) {
    console.error('❌ Error en la prueba:');
    console.error('📊 Status:', error.response?.status);
    console.error('📋 Headers:', error.response?.headers);
    console.error('💬 Mensaje:', error.response?.data);
    console.error('🔍 Error completo:', error.message);
  }
}

// Ejecutar la prueba
testCreateDiligencia();