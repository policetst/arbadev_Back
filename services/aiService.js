import Groq from 'groq-sdk';
import pool from '../db/db.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar .env desde la carpeta del backend
dotenv.config({ path: join(__dirname, '..', '.env') });

// Verificar que la API key esté configurada
if (!process.env.GROQ_API_KEY) {
  console.warn('⚠️ GROQ_API_KEY no está configurada. El asistente IA no funcionará.');
  console.warn('   Obtén una API key gratuita en: https://console.groq.com');
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '',
});

/**
 * Servicio de IA para consultas sobre incidencias, personas, vehículos, etc.
 * Usa Groq (gratuito) con el modelo Llama 3.3
 */
class AIService {
  constructor() {
    this.systemPrompt = `Eres un asistente del sistema ArbaDevPolice. 

INSTRUCCIONES:
1. Responde SIEMPRE en español
2. USA DIRECTAMENTE los datos JSON que te proporciono
3. COPIA los datos EXACTOS (DNI, nombres, teléfonos, matrículas, marcas, modelos, colores, direcciones)
4. NO inventes datos - usa SOLO lo que está en el JSON
5. Sé directo, preciso y específico

Tienes acceso COMPLETO a:
- Todas las personas (DNI, nombres, teléfonos, direcciones)
- Todos los vehículos (matrículas, marcas, modelos, colores, seguros, ITV)
- Todas las incidencias (códigos, tipos, estados, ubicaciones, descripciones, fechas)
- Relaciones personas-vehículos
- Relaciones incidencias-personas
- Relaciones incidencias-vehículos

Proporciona TODOS los detalles cuando te los pidan.
`;
  }

  /**
   * Obtiene el contexto de datos del sistema para la consulta de IA
   */
  async getSystemContext() {
    try {
      // Obtener estadísticas de incidencias
      const incidentsStats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'Open' THEN 1 END) as abiertas,
          COUNT(CASE WHEN status = 'Closed' THEN 1 END) as cerradas,
          COUNT(CASE WHEN brigade_field = true THEN 1 END) as brigade_field
        FROM incidents
      `);

      // Obtener incidencias por tipo
      const incidentsByType = await pool.query(`
        SELECT type, COUNT(*) as cantidad
        FROM incidents
        GROUP BY type
        ORDER BY cantidad DESC
      `);

      // Obtener estadísticas de personas
      const peopleStats = await pool.query(`
        SELECT COUNT(*) as total FROM people
      `);

      // Obtener estadísticas de vehículos
      const vehiclesStats = await pool.query(`
        SELECT COUNT(*) as total FROM vehicles
      `);

      // Obtener estadísticas de atestados
      const atestadosStats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN estado = 'activo' THEN 1 END) as activos,
          COUNT(CASE WHEN estado = 'cerrado' THEN 1 END) as cerrados
        FROM atestados
      `);

      // Obtener incidencias recientes (últimas 20)
      const recentIncidents = await pool.query(`
        SELECT code, status, location, type, description, creation_date
        FROM incidents
        ORDER BY creation_date DESC
        LIMIT 20
      `);

      // Obtener usuarios activos
      const usersStats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'Active' THEN 1 END) as activos,
          COUNT(CASE WHEN role = 'Administrator' THEN 1 END) as administradores
        FROM users
      `);

      // CARGAR TODAS LAS PERSONAS (sin límite)
      const allPeople = await pool.query(`
        SELECT dni, first_name, last_name1, last_name2, phone_number, address
        FROM people
        ORDER BY last_name1, first_name
      `);

      // CARGAR TODOS LOS VEHÍCULOS (sin límite)
      const allVehicles = await pool.query(`
        SELECT license_plate, brand, model, color, insurance, inspection_date
        FROM vehicles
        ORDER BY brand, model
      `);

      // CARGAR TODAS LAS RELACIONES PERSONAS-VEHÍCULOS
      const peopleVehicles = await pool.query(`
        SELECT person_dni, vehicle_license_plate
        FROM people_vehicles
      `);

      // CARGAR TODAS LAS RELACIONES INCIDENCIAS-PERSONAS
      const incidentsPeople = await pool.query(`
        SELECT incident_code, person_dni
        FROM incidents_people
      `);

      // CARGAR TODAS LAS RELACIONES INCIDENCIAS-VEHÍCULOS
      const incidentsVehicles = await pool.query(`
        SELECT incident_code, vehicle_license_plate
        FROM incidents_vehicles
      `);

      return {
        incidentsStats: incidentsStats.rows[0],
        incidentsByType: incidentsByType.rows,
        peopleStats: peopleStats.rows[0],
        vehiclesStats: vehiclesStats.rows[0],
        atestadosStats: atestadosStats.rows[0],
        recentIncidents: recentIncidents.rows,
        usersStats: usersStats.rows[0],
        // DATOS COMPLETOS
        allPeople: allPeople.rows,
        allVehicles: allVehicles.rows,
        peopleVehicles: peopleVehicles.rows,
        incidentsPeople: incidentsPeople.rows,
        incidentsVehicles: incidentsVehicles.rows
      };
    } catch (error) {
      console.error('Error al obtener contexto del sistema:', error);
      return null;
    }
  }

  /**
   * Obtiene datos específicos según la consulta del usuario
   */
  async getSpecificData(query) {
    const lowerQuery = query.toLowerCase();
    const additionalData = {};

    try {
      // Buscar nombres propios en la consulta
      // 1. Primero detectar palabras que empiezan con mayúscula
      let nameMatches = query.match(/\b[A-ZÑÁÉÍÓÚ][a-zñáéíóúü]+(?:\s+[A-ZÑÁÉÍÓÚ][a-zñáéíóúü]+)*/g);
      
      // 2. También buscar después de palabras clave (busca, hablame, información)
      if (!nameMatches || nameMatches.length === 0) {
        const keywordPatterns = [
          /busca(?:\s+a)?\s+([a-zñáéíóúü]+(?:\s+[a-zñáéíóúü]+)*)/i,
          /hablame\s+de(?:\s+el)?\s+([a-zñáéíóúü]+(?:\s+[a-zñáéíóúü]+)*)/i,
          /información\s+(?:sobre|de)\s+([a-zñáéíóúü]+(?:\s+[a-zñáéíóúü]+)*)/i,
          /datos\s+(?:sobre|de)\s+([a-zñáéíóúü]+(?:\s+[a-zñáéíóúü]+)*)/i,
          /(?:es|se\s+llama)\s+([a-zñáéíóúü]+(?:\s+[a-zñáéíóúü]+)*)/i
        ];
        
        for (const pattern of keywordPatterns) {
          const match = lowerQuery.match(pattern);
          if (match && match[1]) {
            nameMatches = [match[1]];
            break;
          }
        }
      }
      
      // Si hay nombres específicos, buscar en TODA la base de datos
      if (nameMatches && nameMatches.length > 0) {
        const searchTerms = nameMatches.map(name => `%${name}%`);
        const peopleQuery = `
          SELECT dni, first_name, last_name1, last_name2, phone_number, address
          FROM people
          WHERE ${searchTerms.map((_, idx) => 
            `(LOWER(first_name) LIKE LOWER($${idx + 1}) OR LOWER(last_name1) LIKE LOWER($${idx + 1}) OR LOWER(last_name2) LIKE LOWER($${idx + 1}))`
          ).join(' OR ')}
          ORDER BY last_name1, first_name
        `;
        
        const matchedPeople = await pool.query(peopleQuery, searchTerms);
        additionalData.personasCoincidentes = matchedPeople.rows;
        
        if (matchedPeople.rows.length > 0) {
          const dnis = matchedPeople.rows.map(p => p.dni);
          
          // Obtener incidencias relacionadas
          const relatedIncidents = await pool.query(`
            SELECT DISTINCT i.code, i.status, i.location, i.type, i.description, i.creation_date, ip.person_dni
            FROM incidents i
            INNER JOIN incidents_people ip ON i.code = ip.incident_code
            WHERE ip.person_dni = ANY($1::text[])
            ORDER BY i.creation_date DESC
          `, [dnis]);
          additionalData.incidenciasPersonas = relatedIncidents.rows;
          
          // Obtener vehículos asociados a estas personas
          const relatedVehicles = await pool.query(`
            SELECT DISTINCT v.license_plate, v.brand, v.model, v.color, v.insurance, v.inspection_date, pv.person_dni
            FROM vehicles v
            INNER JOIN people_vehicles pv ON v.license_plate = pv.vehicle_license_plate
            WHERE pv.person_dni = ANY($1::text[])
          `, [dnis]);
          additionalData.vehiculosPersonas = relatedVehicles.rows;
        }
      } else {
        // Si no hay nombres específicos, cargar muestra representativa
        const people = await pool.query(`
          SELECT dni, first_name, last_name1, last_name2, phone_number, address
          FROM people
          ORDER BY last_name1, first_name
          LIMIT 50
        `);
        additionalData.personas = people.rows;
      }

      // Buscar matrículas en el query (formato: 1234ABC, 1234-ABC, etc.)
      const plateMatches = query.match(/\b\d{4}[\s-]?[A-Z]{3}\b/gi);
      
      // Buscar marcas mencionadas
      const brandKeywords = ['ford', 'seat', 'renault', 'volkswagen', 'peugeot', 'opel', 'citroen', 'mercedes', 'bmw', 'audi', 'toyota', 'nissan', 'honda'];
      const mentionedBrands = brandKeywords.filter(brand => lowerQuery.includes(brand));
      
      // Si hay matrículas específicas, buscar en TODA la base de datos
      if (plateMatches && plateMatches.length > 0) {
        const plates = plateMatches.map(p => p.replace(/[\s-]/g, ''));
        const matchedVehicles = await pool.query(`
          SELECT license_plate, brand, model, color, insurance, inspection_date
          FROM vehicles
          WHERE license_plate = ANY($1::text[])
        `, [plates]);
        additionalData.vehiculosCoincidentes = matchedVehicles.rows;
        
        if (matchedVehicles.rows.length > 0) {
          const licensePlates = matchedVehicles.rows.map(v => v.license_plate);
          
          // Obtener incidencias relacionadas
          const relatedIncidents = await pool.query(`
            SELECT DISTINCT i.code, i.status, i.location, i.type, i.description, i.creation_date, iv.vehicle_license_plate
            FROM incidents i
            INNER JOIN incidents_vehicles iv ON i.code = iv.incident_code
            WHERE iv.vehicle_license_plate = ANY($1::text[])
            ORDER BY i.creation_date DESC
          `, [licensePlates]);
          additionalData.incidenciasVehiculos = relatedIncidents.rows;
          
          // Obtener propietarios de estos vehículos
          const vehicleOwners = await pool.query(`
            SELECT DISTINCT p.dni, p.first_name, p.last_name1, p.last_name2, p.phone_number, p.address, pv.vehicle_license_plate
            FROM people p
            INNER JOIN people_vehicles pv ON p.dni = pv.person_dni
            WHERE pv.vehicle_license_plate = ANY($1::text[])
          `, [licensePlates]);
          additionalData.propietariosVehiculos = vehicleOwners.rows;
        }
      } 
      // Si se menciona una marca específica, buscar TODOS los vehículos de esa marca
      else if (mentionedBrands.length > 0) {
        const brandSearchTerms = mentionedBrands.map(brand => `%${brand}%`);
        const matchedVehicles = await pool.query(`
          SELECT license_plate, brand, model, color, insurance, inspection_date
          FROM vehicles
          WHERE ${brandSearchTerms.map((_, idx) => 
            `LOWER(brand) LIKE LOWER($${idx + 1})`
          ).join(' OR ')}
          ORDER BY brand, model
        `, brandSearchTerms);
        additionalData.vehiculosCoincidentes = matchedVehicles.rows;
      } 
      // Si no hay búsqueda específica, cargar muestra representativa
      else {
        const vehicles = await pool.query(`
          SELECT license_plate, brand, model, color, insurance, inspection_date
          FROM vehicles
          ORDER BY brand, model
          LIMIT 50
        `);
        additionalData.vehiculos = vehicles.rows;
      }

      // Si pregunta por estadísticas de apellidos
      if (lowerQuery.includes('estadística') || lowerQuery.includes('estadistica') || 
          lowerQuery.includes('cuántos') || lowerQuery.includes('cuantos') ||
          lowerQuery.includes('apellido')) {
        
        // Detectar si menciona un apellido específico después de palabras clave
        const apellidoPatterns = [
          /apellido[s]?\s+([a-zñáéíóúü]+)/i,
          /con\s+apellido\s+([a-zñáéíóúü]+)/i,
          /de\s+apellido\s+([a-zñáéíóúü]+)/i,
          /estadística[s]?\s+(?:de|del|para)\s+(?:apellido\s+)?([a-zñáéíóúü]+)/i,
          /cuántos?\s+([a-zñáéíóúü]+)/i
        ];
        
        let apellidoFound = null;
        for (const pattern of apellidoPatterns) {
          const match = lowerQuery.match(pattern);
          if (match && match[1] && match[1].length > 2) {
            apellidoFound = match[1];
            break;
          }
        }
        
        if (apellidoFound) {
          // Buscar todas las personas con ese apellido
          const peopleWithLastname = await pool.query(`
            SELECT dni, first_name, last_name1, last_name2, phone_number, address
            FROM people
            WHERE LOWER(last_name1) LIKE LOWER($1) OR LOWER(last_name2) LIKE LOWER($1)
            ORDER BY last_name1, first_name
          `, [`%${apellidoFound}%`]);
          
          additionalData.personasConApellido = peopleWithLastname.rows;
          
          if (peopleWithLastname.rows.length > 0) {
            const dnis = peopleWithLastname.rows.map(p => p.dni);
            
            // Obtener estadísticas de incidencias por tipo para este apellido
            const incidentStats = await pool.query(`
              SELECT 
                i.type,
                COUNT(*) as cantidad,
                COUNT(CASE WHEN i.status = 'Open' THEN 1 END) as abiertas,
                COUNT(CASE WHEN i.status = 'Closed' THEN 1 END) as cerradas
              FROM incidents i
              INNER JOIN incidents_people ip ON i.code = ip.incident_code
              WHERE ip.person_dni = ANY($1::text[])
              GROUP BY i.type
              ORDER BY cantidad DESC
            `, [dnis]);
            
            additionalData.estadisticasIncidenciasApellido = incidentStats.rows;
            
            // Obtener total de incidencias
            const totalIncidents = await pool.query(`
              SELECT COUNT(DISTINCT i.code) as total
              FROM incidents i
              INNER JOIN incidents_people ip ON i.code = ip.incident_code
              WHERE ip.person_dni = ANY($1::text[])
            `, [dnis]);
            
            additionalData.totalIncidenciasApellido = totalIncidents.rows[0].total;
          }
        }
      }

      // Si pregunta por incidencias específicas o tipos específicos
      if (lowerQuery.includes('incidencia') || lowerQuery.includes('caso') || lowerQuery.includes('denuncia') ||
          lowerQuery.includes('violencia') || lowerQuery.includes('género') || lowerQuery.includes('genero') ||
          lowerQuery.includes('robo') || lowerQuery.includes('hurto') || lowerQuery.includes('agresión') ||
          lowerQuery.includes('agresion') || lowerQuery.includes('maltrato')) {
        
        // Buscar palabras clave en el query para filtrar por tipo o descripción
        const keywords = [];
        const keywordMap = {
          'violencia': ['violencia', 'agresión', 'maltrato'],
          'género': ['género', 'genero', 'machista', 'sexista'],
          'robo': ['robo', 'hurto', 'sustracción'],
          'tráfico': ['tráfico', 'trafico', 'accidente', 'circulación'],
          'droga': ['droga', 'estupefaciente', 'narcótico']
        };
        
        for (const [key, synonyms] of Object.entries(keywordMap)) {
          if (synonyms.some(word => lowerQuery.includes(word))) {
            keywords.push(...synonyms);
          }
        }
        
        let incidentsQuery = `
          SELECT code, status, location, type, description, creation_date, closure_date
          FROM incidents
        `;
        
        if (keywords.length > 0) {
          // Buscar en tipo o descripción
          const conditions = keywords.map((_, idx) => 
            `(LOWER(type) LIKE LOWER($${idx + 1}) OR LOWER(description) LIKE LOWER($${idx + 1}))`
          ).join(' OR ');
          incidentsQuery += ` WHERE ${conditions}`;
          const searchTerms = keywords.map(k => `%${k}%`);
          incidentsQuery += ` ORDER BY creation_date DESC LIMIT 50`;
          
          const incidents = await pool.query(incidentsQuery, searchTerms);
          additionalData.incidencias = incidents.rows;
        } else {
          // Consulta general
          incidentsQuery += ` ORDER BY creation_date DESC LIMIT 30`;
          const incidents = await pool.query(incidentsQuery);
          additionalData.incidencias = incidents.rows;
        }
      }

      // Si pregunta por atestados
      if (lowerQuery.includes('atestado') || lowerQuery.includes('diligencia')) {
        const atestados = await pool.query(`
          SELECT a.id, a.numero, a.fecha, a.descripcion, a.estado,
                 COUNT(d.id) as num_diligencias
          FROM atestados a
          LEFT JOIN diligencias d ON a.id = d.atestado_id
          GROUP BY a.id
          ORDER BY a.fecha DESC
          LIMIT 20
        `);
        additionalData.atestados = atestados.rows;
      }

      // Si pregunta por estadísticas temporales
      if (lowerQuery.includes('mes') || lowerQuery.includes('semana') || lowerQuery.includes('día') || lowerQuery.includes('fecha')) {
        const incidentsByMonth = await pool.query(`
          SELECT 
            DATE_TRUNC('month', creation_date) as mes,
            COUNT(*) as cantidad
          FROM incidents
          WHERE creation_date >= NOW() - INTERVAL '12 months'
          GROUP BY DATE_TRUNC('month', creation_date)
          ORDER BY mes DESC
        `);
        additionalData.incidenciasPorMes = incidentsByMonth.rows;
      }

      // Si pregunta por ubicaciones
      if (lowerQuery.includes('ubicación') || lowerQuery.includes('ubicacion') || lowerQuery.includes('lugar') || lowerQuery.includes('zona')) {
        const incidentsByLocation = await pool.query(`
          SELECT location, COUNT(*) as cantidad
          FROM incidents
          GROUP BY location
          ORDER BY cantidad DESC
          LIMIT 20
        `);
        additionalData.incidenciasPorUbicacion = incidentsByLocation.rows;
      }

      return additionalData;
    } catch (error) {
      console.error('Error al obtener datos específicos:', error);
      return additionalData;
    }
  }

  /**
   * Procesa una consulta del usuario y devuelve la respuesta de la IA
   */
  async processQuery(userQuery, conversationHistory = []) {
    try {
      // Verificar que la API key esté configurada
      if (!process.env.GROQ_API_KEY) {
        return {
          ok: false,
          error: 'GROQ_API_KEY no está configurada. Obtén una gratis en https://console.groq.com'
        };
      }

      // Obtener contexto del sistema
      const systemContext = await this.getSystemContext();
      
      // Obtener datos específicos según la consulta
      const specificData = await this.getSpecificData(userQuery);

      // Construir el contexto para la IA
      let dataContext = '\n\n=== DATOS DEL SISTEMA ===\n';
      
      if (systemContext) {
        dataContext += `\nESTADÍSTICAS:
- Incidencias: ${systemContext.incidentsStats.total} (${systemContext.incidentsStats.abiertas} abiertas, ${systemContext.incidentsStats.cerradas} cerradas)
- Personas: ${systemContext.peopleStats.total}
- Vehículos: ${systemContext.vehiclesStats.total}

TODAS LAS PERSONAS:
${systemContext.allPeople.map(p => `${p.dni}|${p.first_name} ${p.last_name1} ${p.last_name2 || ''}|${p.phone_number || ''}|${p.address || ''}`).join('\n')}

TODOS LOS VEHÍCULOS:
${systemContext.allVehicles.map(v => `${v.license_plate}|${v.brand} ${v.model}|${v.color || ''}|${v.insurance || ''}`).join('\n')}

RELACIONES PERSONAS-VEHÍCULOS:
${systemContext.peopleVehicles.map(pv => `Persona ${pv.person_dni} tiene vehículo ${pv.vehicle_license_plate}`).join('\n')}

INCIDENCIAS POR TIPO:
${systemContext.incidentsByType.map(t => `${t.type}: ${t.cantidad}`).join('\n')}

INCIDENCIAS RECIENTES:
${systemContext.recentIncidents.map(i => `[${i.code}] ${i.type} - ${i.status} - ${i.location} - ${i.description || 'Sin descripción'}`).join('\n')}
`;
      }

      // Añadir datos específicos si los hay
      if (Object.keys(specificData).length > 0) {
        dataContext += '\n=== DATOS ESPECÍFICOS DE TU BÚSQUEDA ===\n';
        
        if (specificData.personasCoincidentes && specificData.personasCoincidentes.length > 0) {
          dataContext += `\nPERSONAS ENCONTRADAS:\n`;
          specificData.personasCoincidentes.forEach(p => {
            dataContext += `DNI: ${p.dni}, Nombre: ${p.first_name} ${p.last_name1} ${p.last_name2 || ''}, Tel: ${p.phone_number || 'N/A'}, Dir: ${p.address || 'N/A'}\n`;
          });
        }

        if (specificData.vehiculosPersonas && specificData.vehiculosPersonas.length > 0) {
          dataContext += `\nVEHÍCULOS DE ESTAS PERSONAS:\n`;
          specificData.vehiculosPersonas.forEach(v => {
            dataContext += `Persona ${v.person_dni} -> Matrícula: ${v.license_plate}, ${v.brand} ${v.model}, Color: ${v.color || 'N/A'}\n`;
          });
        }

        if (specificData.incidenciasPersonas && specificData.incidenciasPersonas.length > 0) {
          dataContext += `\nINCIDENCIAS DE ESTAS PERSONAS:\n`;
          specificData.incidenciasPersonas.forEach(i => {
            dataContext += `Persona ${i.person_dni}: [${i.code}] ${i.type} - ${i.status} - ${i.location} - ${i.description || 'Sin desc'}\n`;
          });
        }

        if (specificData.vehiculosCoincidentes && specificData.vehiculosCoincidentes.length > 0) {
          dataContext += `\nVEHÍCULOS ENCONTRADOS:\n`;
          specificData.vehiculosCoincidentes.forEach(v => {
            dataContext += `${v.license_plate}: ${v.brand} ${v.model}, Color: ${v.color || 'N/A'}, Seguro: ${v.insurance || 'N/A'}\n`;
          });
        }

        if (specificData.propietariosVehiculos && specificData.propietariosVehiculos.length > 0) {
          dataContext += `\nPROPIETARIOS DE ESTOS VEHÍCULOS:\n`;
          specificData.propietariosVehiculos.forEach(p => {
            dataContext += `Vehículo ${p.vehicle_license_plate} -> ${p.first_name} ${p.last_name1} (${p.dni}), Tel: ${p.phone_number || 'N/A'}\n`;
          });
        }

        if (specificData.incidenciasVehiculos && specificData.incidenciasVehiculos.length > 0) {
          dataContext += `\nINCIDENCIAS DE ESTOS VEHÍCULOS:\n`;
          specificData.incidenciasVehiculos.forEach(i => {
            dataContext += `Vehículo ${i.vehicle_license_plate}: [${i.code}] ${i.type} - ${i.status} - ${i.description || 'Sin desc'}\n`;
          });
        }

        if (specificData.personasConApellido && specificData.personasConApellido.length > 0) {
          dataContext += `\nPERSONAS CON ESTE APELLIDO:\n`;
          specificData.personasConApellido.forEach(p => {
            dataContext += `${p.dni}: ${p.first_name} ${p.last_name1} ${p.last_name2 || ''}, Tel: ${p.phone_number || 'N/A'}\n`;
          });
        }

        if (specificData.estadisticasIncidenciasApellido && specificData.estadisticasIncidenciasApellido.length > 0) {
          dataContext += `\nESTADÍSTICAS DE INCIDENCIAS PARA ESTE APELLIDO:\n`;
          specificData.estadisticasIncidenciasApellido.forEach(s => {
            dataContext += `${s.type}: ${s.cantidad} total (${s.abiertas} abiertas, ${s.cerradas} cerradas)\n`;
          });
          if (specificData.totalIncidenciasApellido) {
            dataContext += `TOTAL: ${specificData.totalIncidenciasApellido} incidencias\n`;
          }
        }
      }

      // Preparar mensajes para Groq (formato OpenAI)
      const messages = [
        {
          role: 'system',
          content: this.systemPrompt
        },
        ...conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        {
          role: 'user',
          content: userQuery + dataContext
        }
      ];

      // Llamar a la API de Groq (gratuita y rápida)
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile', // Modelo gratuito y muy capaz
        messages: messages,
        max_tokens: 2048,
        temperature: 0.7,
      });

      return {
        ok: true,
        response: response.choices[0].message.content,
        usage: {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0
        }
      };
    } catch (error) {
      console.error('Error al procesar consulta IA:', error);
      return {
        ok: false,
        error: error.message || 'Error al procesar la consulta'
      };
    }
  }

  /**
   * Genera un resumen ejecutivo del estado actual del sistema
   */
  async generateExecutiveSummary() {
    const query = 'Genera un resumen ejecutivo completo del estado actual del sistema, incluyendo estadísticas clave, tendencias y cualquier punto de atención importante.';
    return await this.processQuery(query);
  }

  /**
   * Analiza patrones en las incidencias
   */
  async analyzeIncidentPatterns() {
    const query = 'Analiza los patrones en las incidencias: tipos más frecuentes, ubicaciones problemáticas, tendencias temporales y cualquier correlación que encuentres.';
    return await this.processQuery(query);
  }
}

export default new AIService();
