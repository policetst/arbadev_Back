import fetch from 'node-fetch';

const BASE_URL = 'https://arbadev-back-joq0.onrender.com';

// Función para hacer login y obtener token
async function login() {
  console.log('🔐 Intentando login...');
  const response = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'AR01492',
      password: 'Arba2024'
    })
  });
  
  const data = await response.json();
  if (data.ok && data.token) {
    console.log('✅ Login exitoso, token obtenido');
    return data.token;
  } else {
    throw new Error('Login falló: ' + JSON.stringify(data));
  }
}

// Test 1: Chat con IA
async function testChat(token) {
  console.log('\n🤖 TEST 1: Chat con IA - Preguntando por Jose Luis');
  const response = await fetch(`${BASE_URL}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      message: '¿Tienes información sobre Jose Luis? ¿En qué incidencias aparece?',
      conversationHistory: []
    })
  });
  
  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Respuesta:', JSON.stringify(data, null, 2));
  return data;
}

// Test 2: Resumen ejecutivo
async function testSummary(token) {
  console.log('\n📊 TEST 2: Resumen ejecutivo');
  const response = await fetch(`${BASE_URL}/ai/summary`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Respuesta:', JSON.stringify(data, null, 2));
  return data;
}

// Test 3: Análisis de patrones
async function testPatterns(token) {
  console.log('\n🔍 TEST 3: Análisis de patrones');
  const response = await fetch(`${BASE_URL}/ai/analyze-patterns`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  console.log('Status:', response.status);
  console.log('Respuesta:', JSON.stringify(data, null, 2));
  return data;
}

// Ejecutar todos los tests
async function runTests() {
  try {
    console.log('🚀 Iniciando tests de endpoints de IA...\n');
    
    const token = await login();
    
    await testChat(token);
    await testSummary(token);
    await testPatterns(token);
    
    console.log('\n✅ Todos los tests completados');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error en los tests:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
