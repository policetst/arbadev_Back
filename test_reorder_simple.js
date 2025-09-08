// Test simple del endpoint de reordenamiento
import axios from 'axios';

const BASE_URL = 'http://localhost:4000';

async function testReorderEndpoint() {
  try {
    console.log('🚀 Iniciando test del endpoint de reordenamiento...');
    
    // 1. Obtener token de autenticación
    console.log('\n1. Obteniendo token de autenticación...');
    const loginResponse = await axios.post(`${BASE_URL}/login`, {
      usuario: 'AR01492',
      password: 'Arba2024'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Token obtenido:', token ? 'Sí' : 'No');
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // 2. Obtener lista de atestados
    console.log('\n2. Obteniendo lista de atestados...');
    const atestadosResponse = await axios.get(`${BASE_URL}/atestados`, { headers });
    const atestados = atestadosResponse.data;
    console.log(`✅ Atestados encontrados: ${atestados.length}`);
    
    if (atestados.length === 0) {
      console.log('❌ No hay atestados para probar');
      return;
    }
    
    // 3. Seleccionar el primer atestado
    const atestado = atestados[0];
    console.log(`\n3. Usando atestado ID: ${atestado.id}`);
    
    // 4. Obtener diligencias del atestado
    console.log('\n4. Obteniendo diligencias...');
    const diligenciasResponse = await axios.get(`${BASE_URL}/atestados/${atestado.id}/diligencias`, { headers });
    const diligencias = diligenciasResponse.data;
    console.log(`✅ Diligencias encontradas: ${diligencias.length}`);
    
    if (diligencias.length < 2) {
      console.log('❌ Se necesitan al menos 2 diligencias para probar el reordenamiento');
      return;
    }
    
    // 5. Mostrar orden actual
    console.log('\n5. Orden actual de diligencias:');
    diligencias.forEach((d, i) => {
      console.log(`   ${i + 1}. ID: ${d.id}, Orden: ${d.orden}`);
    });
    
    // 6. Crear nuevo orden (invertir las primeras dos)
    const newOrder = diligencias.map((d, index) => ({
      id: parseInt(d.id),
      orden: index + 1
    }));
    
    // Intercambiar las primeras dos
    if (newOrder.length >= 2) {
      [newOrder[0], newOrder[1]] = [newOrder[1], newOrder[0]];
      newOrder[0].orden = 1;
      newOrder[1].orden = 2;
    }
    
    console.log('\n6. Nuevo orden a aplicar:');
    newOrder.forEach((item, i) => {
      console.log(`   ${item.orden}. ID: ${item.id}`);
    });
    
    // 7. Enviar reordenamiento
    console.log('\n7. Enviando reordenamiento...');
    const reorderResponse = await axios.put(
      `${BASE_URL}/atestados/${atestado.id}/reorder-diligencias`,
      { diligenciasOrder: newOrder },
      { headers }
    );
    
    console.log('✅ Reordenamiento exitoso!');
    console.log('📋 Respuesta:', reorderResponse.data);
    
    // 8. Verificar el nuevo orden
    console.log('\n8. Verificando nuevo orden...');
    const verifyResponse = await axios.get(`${BASE_URL}/atestados/${atestado.id}/diligencias`, { headers });
    const newDiligencias = verifyResponse.data;
    
    console.log('✅ Orden verificado:');
    newDiligencias.forEach((d, i) => {
      console.log(`   ${i + 1}. ID: ${d.id}, Orden: ${d.orden}`);
    });
    
    console.log('\n🎉 Test completado exitosamente!');
    
  } catch (error) {
    console.error('❌ Error en el test:', error.message);
    if (error.response) {
      console.error('📋 Status:', error.response.status);
      console.error('📋 Data:', error.response.data);
    }
  }
}

// Ejecutar el test
testReorderEndpoint();