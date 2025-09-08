import axios from 'axios';

// Script para probar la funcionalidad de drag and drop desde el frontend
async function testDragDropFrontend() {
    console.log('🧪 Iniciando test de drag and drop desde frontend...');
    
    const baseURL = 'http://localhost:4000/api';
    
    try {
        // 1. Primero intentar login para obtener un token válido
        console.log('\n1. 🔐 Intentando login...');
        
        const loginResponse = await axios.post(`http://localhost:4000/login`, {
            username: 'admin',
            password: 'admin123'
        });
        
        const token = loginResponse.data.token;
        console.log('✅ Login exitoso, token obtenido');
        
        // 2. Configurar headers con el token
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        
        // 3. Obtener lista de atestados
        console.log('\n2. 📋 Obteniendo lista de atestados...');
        
        const atestadosResponse = await axios.get(`${baseURL}/atestados`, { headers });
        const atestados = atestadosResponse.data;
        
        console.log(`✅ Encontrados ${atestados.length} atestados`);
        
        if (atestados.length === 0) {
            console.log('❌ No hay atestados para probar');
            return;
        }
        
        // 4. Seleccionar el primer atestado
        const atestado = atestados[0];
        console.log(`\n3. 🎯 Probando con atestado ID: ${atestado.id}`);
        
        // 5. Obtener detalles del atestado y sus diligencias
        const atestadoDetailResponse = await axios.get(`${baseURL}/atestados/${atestado.id}`, { headers });
        const atestadoDetail = atestadoDetailResponse.data;
        
        console.log(`✅ Atestado cargado: ${atestadoDetail.numero || atestado.id}`);
        console.log(`📝 Diligencias encontradas: ${atestadoDetail.diligencias ? atestadoDetail.diligencias.length : 0}`);
        
        if (!atestadoDetail.diligencias || atestadoDetail.diligencias.length < 2) {
            console.log('⚠️ Se necesitan al menos 2 diligencias para probar el reordenamiento');
            
            // Crear diligencias de prueba si no existen
            console.log('\n4. 🔧 Creando diligencias de prueba...');
            
            const diligencia1 = await axios.post(`${baseURL}/atestados/${atestado.id}/diligencias`, {
                content: 'Primera diligencia de prueba para drag and drop',
                plantilla_id: null
            }, { headers });
            
            const diligencia2 = await axios.post(`${baseURL}/atestados/${atestado.id}/diligencias`, {
                content: 'Segunda diligencia de prueba para drag and drop',
                plantilla_id: null
            }, { headers });
            
            const diligencia3 = await axios.post(`${baseURL}/atestados/${atestado.id}/diligencias`, {
                content: 'Tercera diligencia de prueba para drag and drop',
                plantilla_id: null
            }, { headers });
            
            console.log('✅ Diligencias de prueba creadas');
            
            // Recargar el atestado
            const updatedAtestadoResponse = await axios.get(`${baseURL}/atestados/${atestado.id}`, { headers });
            atestadoDetail.diligencias = updatedAtestadoResponse.data.diligencias;
        }
        
        // 6. Probar el reordenamiento
        console.log('\n5. 🔄 Probando reordenamiento de diligencias...');
        
        const diligencias = atestadoDetail.diligencias;
        const ordenOriginal = diligencias.map(d => d.id);
        console.log(`📋 Orden original: [${ordenOriginal.join(', ')}]`);
        
        // Invertir el orden
        const nuevoOrden = [...ordenOriginal].reverse();
        console.log(`🔄 Nuevo orden: [${nuevoOrden.join(', ')}]`);
        
        // Enviar petición de reordenamiento
        const reorderResponse = await axios.put(
            `${baseURL}/atestados/${atestado.id}/reorder-diligencias`,
            {
                atestadoId: atestado.id,
                diligenciasOrder: nuevoOrden
            },
            { headers }
        );
        
        console.log('✅ Reordenamiento enviado al backend');
        console.log('📤 Respuesta del servidor:', reorderResponse.data);
        
        // 7. Verificar que el orden se aplicó correctamente
        console.log('\n6. ✅ Verificando el nuevo orden...');
        
        const verifyResponse = await axios.get(`${baseURL}/atestados/${atestado.id}`, { headers });
        const nuevasDiligencias = verifyResponse.data.diligencias;
        const ordenFinal = nuevasDiligencias.map(d => d.id);
        
        console.log(`📋 Orden final: [${ordenFinal.join(', ')}]`);
        
        if (JSON.stringify(ordenFinal) === JSON.stringify(nuevoOrden)) {
            console.log('🎉 ¡ÉXITO! El reordenamiento funcionó correctamente');
        } else {
            console.log('❌ ERROR: El orden no se aplicó correctamente');
            console.log(`   Esperado: [${nuevoOrden.join(', ')}]`);
            console.log(`   Obtenido: [${ordenFinal.join(', ')}]`);
        }
        
        // 8. Información para el frontend
        console.log('\n7. 🌐 Información para probar en el frontend:');
        console.log(`   URL del atestado: http://localhost:5173/#/atestados/${atestado.id}`);
        console.log(`   URL simple: http://localhost:5173/#/atestados/${atestado.id}/simple`);
        console.log(`   Token para usar: ${token}`);
        
    } catch (error) {
        console.error('❌ Error durante el test:', error.message);
        if (error.response) {
            console.error('📤 Respuesta del servidor:', error.response.status, error.response.data);
        }
    }
}

// Ejecutar el test
testDragDropFrontend();