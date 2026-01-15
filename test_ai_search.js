import fetch from 'node-fetch';

const BASE_URL = 'https://arbadev-back-joq0.onrender.com';
// const BASE_URL = 'http://localhost:4000';

async function testAISearch() {
  console.log('🔐 Iniciando sesión...\n');
  
  // 1. Login
  const loginResponse = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      badge_number: 'AR01492',
      password: 'Arba2024'
    })
  });

  if (!loginResponse.ok) {
    console.error('❌ Error en login:', loginResponse.status);
    const errorText = await loginResponse.text();
    console.error(errorText);
    return;
  }

  const loginData = await loginResponse.json();
  const token = loginData.token;
  console.log('✅ Login exitoso. Token:', token.substring(0, 20) + '...\n');

  // 2. Buscar "jose berjano" con la IA
  console.log('🤖 Preguntando a la IA: "busca a jose berjano"\n');
  
  const aiResponse = await fetch(`${BASE_URL}/ai/chat`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      query: 'busca a jose berjano',
      conversationHistory: []
    })
  });

  if (!aiResponse.ok) {
    console.error('❌ Error en consulta IA:', aiResponse.status);
    const errorText = await aiResponse.text();
    console.error(errorText);
    return;
  }

  const aiData = await aiResponse.json();
  
  console.log('='.repeat(80));
  console.log('RESPUESTA DE LA IA:');
  console.log('='.repeat(80));
  console.log(aiData.response);
  console.log('='.repeat(80));
  console.log('\n📊 Uso de tokens:');
  console.log('- Input:', aiData.usage?.inputTokens || 0);
  console.log('- Output:', aiData.usage?.outputTokens || 0);
}

testAISearch().catch(console.error);
