// Script simple para probar el endpoint de reordenamiento
import axios from 'axios';

const API_BASE_URL = 'https://arbadev-back.onrender.com';

// Función para obtener token (simulado)
function getTokenFromCookie() {
  // En un entorno real, esto obtendría el token de las cookies
  // Para pruebas, necesitarías un token válido
  return 'tu_token_aqui';
}

async function testReorderEndpoint() {
  try {
    console.log('🚀 Probando endpoint de reordenamiento...');
    
    // Configurar axios con token
    const token = getTokenFromCookie();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    
    // Datos de prueba
    const atestadoId = 1; // Cambiar por un ID válido
    const diligenciasOrder = [
      { id: 1, orden: 2 },
      { id: 2, orden: 1 }
    ];
    
    console.log('📤 Enviando datos:', { atestadoId, diligenciasOrder });
    
    const response = await axios.put(
      `${API_BASE_URL}/atestados/${atestadoId}/reorder-diligencias`,
      { diligenciasOrder },
      { headers }
    );
    
    console.log('✅ Respuesta exitosa:', response.data);
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    console.error('Status:', error.response?.status);
    console.error('Headers:', error.response?.headers);
  }
}

// Ejecutar prueba
testReorderEndpoint();