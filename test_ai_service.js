// Script de prueba para el servicio de IA (Groq - Gratuito)
import aiService from './services/aiService.js';

async function testAIService() {
  console.log('🧪 Probando servicio de IA (Groq - Gratuito)...\n');

  try {
    // 1. Probar obtener contexto del sistema
    console.log('📊 1. Obteniendo contexto del sistema...');
    const context = await aiService.getSystemContext();
    
    if (context) {
      console.log('✅ Contexto obtenido:');
      console.log(`   - Incidencias totales: ${context.incidentsStats.total}`);
      console.log(`   - Incidencias abiertas: ${context.incidentsStats.abiertas}`);
      console.log(`   - Incidencias cerradas: ${context.incidentsStats.cerradas}`);
      console.log(`   - Personas registradas: ${context.peopleStats.total}`);
      console.log(`   - Vehículos registrados: ${context.vehiclesStats.total}`);
      console.log(`   - Atestados: ${context.atestadosStats.total}`);
      console.log(`   - Usuarios: ${context.usersStats.total}\n`);
      
      console.log('   📈 Incidencias por tipo:');
      context.incidentsByType.forEach(t => {
        console.log(`      - ${t.type}: ${t.cantidad}`);
      });
    } else {
      console.log('❌ No se pudo obtener el contexto del sistema\n');
    }

    // 2. Probar una consulta simple a la IA
    console.log('\n🤖 2. Probando consulta a la IA...');
    console.log('   Pregunta: "¿Cuántas incidencias hay abiertas?"');
    
    const result = await aiService.processQuery('¿Cuántas incidencias hay abiertas?');
    
    if (result.ok) {
      console.log('\n✅ Respuesta de la IA:');
      console.log('---');
      console.log(result.response);
      console.log('---');
      console.log(`\n📊 Tokens usados: ${result.usage.inputTokens} entrada, ${result.usage.outputTokens} salida`);
    } else {
      console.log('❌ Error al procesar la consulta:', result.error);
    }

  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
  }

  // Cerrar la conexión de la base de datos
  process.exit(0);
}

testAIService();
