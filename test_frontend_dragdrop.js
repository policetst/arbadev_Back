// Test script para simular exactamente lo que hace el frontend
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const baseURL = 'http://localhost:4000';

// Probar sin autenticación primero
const headers = {
  'Content-Type': 'application/json'
};

async function testFrontendDragDrop() {
  try {
    console.log('🚀 Iniciando test de drag and drop desde frontend...');
    
    // 0. Obtener token de autenticación
    const token = await getValidToken();
    if (!token) {
      console.log('❌ No se pudo obtener token de autenticación');
      return;
    }
    
    // Actualizar headers con el token
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': token
    };
    
    // 1. Obtener el atestado con ID 9 (que sabemos que tiene diligencias)
    const atestadoId = 9;
    console.log(`📋 Obteniendo atestado ${atestadoId}...`);
    
    const atestadoResponse = await axios.get(`${baseURL}/atestados/${atestadoId}`, { headers: authHeaders });
    const atestado = atestadoResponse.data;
    
    console.log(`✅ Atestado cargado: ${atestado.numero || atestadoId}`);
    console.log(`📝 Diligencias encontradas: ${atestado.diligencias ? atestado.diligencias.length : 0}`);
    
    if (!atestado.diligencias || atestado.diligencias.length < 2) {
      console.log('❌ Se necesitan al menos 2 diligencias para probar el reordenamiento');
      return;
    }
    
    // 2. Mostrar orden actual
    console.log('\n📋 Orden actual de diligencias:');
    atestado.diligencias.forEach((diligencia, index) => {
      console.log(`  ${index + 1}. ID: ${diligencia.id}, Orden: ${diligencia.orden}, Texto: ${diligencia.texto_final?.substring(0, 50)}...`);
    });
    
    // 3. Simular drag and drop: mover la primera diligencia al final
    const diligencias = [...atestado.diligencias];
    const draggedItem = diligencias[0]; // Primera diligencia
    const dropIndex = diligencias.length - 1; // Última posición
    
    console.log(`\n🔄 Simulando drag and drop: mover diligencia ${draggedItem.id} de posición 0 a posición ${dropIndex}`);
    
    // Reordenar localmente (como hace el frontend)
    diligencias.splice(0, 1); // Remover de la primera posición
    diligencias.splice(dropIndex, 0, draggedItem); // Insertar en la última posición
    
    // 4. Preparar datos para el backend (exactamente como lo hace el frontend)
    const diligenciasOrder = diligencias.map((diligencia, index) => ({
      id: parseInt(diligencia.id),
      orden: index + 1
    }));
    
    console.log('\n📤 Datos que se enviarían al backend:');
    console.log('URL:', `${baseURL}/atestados/${atestadoId}/reorder-diligencias`);
    console.log('Method: PUT');
    console.log('Headers:', authHeaders);
    console.log('Body:', JSON.stringify({ diligenciasOrder }, null, 2));
    
    // 5. Enviar al backend
    console.log('\n🌐 Enviando solicitud al backend...');
    
    const reorderResponse = await axios.put(
      `${baseURL}/atestados/${atestadoId}/reorder-diligencias`,
      { diligenciasOrder },
      { headers: authHeaders }
    );
    
    console.log('✅ Respuesta del backend:', reorderResponse.data);
    
    // 6. Verificar el resultado
    console.log('\n🔍 Verificando el resultado...');
    const verifyResponse = await axios.get(`${baseURL}/atestados/${atestadoId}`, { headers: authHeaders });
    const updatedAtestado = verifyResponse.data;
    
    console.log('📋 Nuevo orden de diligencias:');
    updatedAtestado.diligencias.forEach((diligencia, index) => {
      console.log(`  ${index + 1}. ID: ${diligencia.id}, Orden: ${diligencia.orden}, Texto: ${diligencia.texto_final?.substring(0, 50)}...`);
    });
    
    console.log('\n🎉 Test de drag and drop completado exitosamente!');
    
  } catch (error) {
    console.error('❌ Error durante el test:', error.message);
    
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📋 Data:', error.response.data);
      console.error('🔧 Headers:', error.response.headers);
    } else if (error.request) {
      console.error('📡 Request error:', error.request);
    }
    
    console.error('🔍 Stack trace:', error.stack);
  }
}

// Función para obtener un token válido
async function getValidToken() {
  try {
    console.log('🔐 Intentando obtener token válido...');
    
    // Login con credenciales válidas
    const loginResponse = await axios.post(`${baseURL}/login`, {
      username: 'AR01492',
      password: 'Arba2024'
    });
    
    if (loginResponse.data && loginResponse.data.token) {
      console.log('✅ Token obtenido exitosamente');
      return `Bearer ${loginResponse.data.token}`;
    } else {
      console.log('❌ No se pudo obtener el token');
      return null;
    }
  } catch (error) {
    console.error('❌ Error al obtener token:', error.message);
    if (error.response) {
      console.error('📊 Status:', error.response.status);
      console.error('📋 Data:', error.response.data);
    }
    return null;
  }
}

// Ejecutar el test
console.log('🧪 Iniciando test de drag and drop frontend...');
console.log('⚠️ Nota: Asegúrate de que el backend esté ejecutándose en http://localhost:3000');
console.log('⚠️ Nota: Necesitarás un token de autenticación válido\n');

testFrontendDragDrop();