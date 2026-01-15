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
    this.systemPrompt = `Eres un asistente experto de la aplicación ArbaDevPolice, un sistema de gestión policial. 
Tu rol es ayudar a los usuarios a consultar información sobre:
- Incidencias policiales (tipos: Animales, Seguridad Ciudadana, Tráfico, Ruidos, Ilícito penal, Incidencias Urbanísticas, etc.)
- Personas registradas en el sistema (con DNI, nombres, teléfonos, direcciones)
- Vehículos registrados (con matrículas, marcas, modelos, colores, seguros)
- Atestados y diligencias
- Estadísticas y datos agregados

CAPACIDADES DEL SISTEMA:
✅ Tengo acceso completo a todas las tablas: incidents, people, vehicles, atestados, diligencias, users
✅ Puedo buscar por nombres de personas (detectando nombres propios automáticamente)
✅ Puedo buscar por matrículas de vehículos (formato: 1234ABC)
✅ Puedo buscar incidencias por tipo, ubicación, fecha, descripción
✅ Puedo mostrar incidencias relacionadas con personas o vehículos específicos
✅ Puedo analizar patrones, tendencias y estadísticas

INSTRUCCIONES IMPORTANTES:
1. Responde siempre en español
2. Sé conciso pero completo en tus respuestas
3. Cuando te proporcione datos del sistema, analízalos y presenta la información de forma clara
4. NUNCA digas que "no tienes acceso" a datos - siempre tienes acceso a toda la información que te proporciono
5. Si no hay datos disponibles para una consulta específica, di "No se encontraron resultados" o "No hay datos registrados"
6. Puedes hacer cálculos, estadísticas y análisis sobre los datos proporcionados
7. Formatea tus respuestas de forma legible usando markdown cuando sea apropiado
8. Si te preguntan por datos sensibles (contraseñas, etc.), indica que esa información es confidencial bajo cualquier circunstancia
9. No inventes datos, usa solo la información que te proporciono

CONTEXTO DEL SISTEMA:
- Los estados de incidencias son: Open (Abierta) y Closed (Cerrada)
- Los tipos de incidencias incluyen: Animales, Seguridad Ciudadana, Tráfico, Ruidos, Ilícito penal, Incidencias Urbanísticas, Otras incidencias no clasificadas
- Los usuarios tienen roles: Administrator y Standard
- Los atestados tienen estados: activo y cerrado`;
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

      // Obtener incidencias recientes (últimas 10)
      const recentIncidents = await pool.query(`
        SELECT code, status, location, type, description, creation_date
        FROM incidents
        ORDER BY creation_date DESC
        LIMIT 10
      `);

      // Obtener usuarios activos
      const usersStats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'Active' THEN 1 END) as activos,
          COUNT(CASE WHEN role = 'Administrator' THEN 1 END) as administradores
        FROM users
      `);

      return {
        incidentsStats: incidentsStats.rows[0],
        incidentsByType: incidentsByType.rows,
        peopleStats: peopleStats.rows[0],
        vehiclesStats: vehiclesStats.rows[0],
        atestadosStats: atestadosStats.rows[0],
        recentIncidents: recentIncidents.rows,
        usersStats: usersStats.rows[0]
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
      // SIEMPRE cargar personas (primeras 100 para tener contexto completo)
      const people = await pool.query(`
        SELECT dni, first_name, last_name1, last_name2, phone_number, address
        FROM people
        ORDER BY last_name1, first_name
        LIMIT 100
      `);
      additionalData.personas = people.rows;

      // SIEMPRE cargar vehículos (todos para tener contexto completo)
      const vehicles = await pool.query(`
        SELECT license_plate, brand, model, color, insurance, inspection_date
        FROM vehicles
        ORDER BY brand, model
        LIMIT 100
      `);
      additionalData.vehiculos = vehicles.rows;

      // Buscar nombres propios en la consulta (palabras que empiezan con mayúscula)
      const nameMatches = query.match(/\b[A-ZÑÁÉÍÓÚ][a-zñáéíóúü]+(?:\s+[A-ZÑÁÉÍÓÚ][a-zñáéíóúü]+)*/g);
      
      // Si hay nombres específicos, buscar incidencias relacionadas
      if (nameMatches && nameMatches.length > 0) {
        const searchTerms = nameMatches.map(name => `%${name}%`);
        const peopleQuery = `
          SELECT dni, first_name, last_name1, last_name2, phone_number, address
          FROM people
          WHERE ${searchTerms.map((_, idx) => 
            `(LOWER(first_name) LIKE LOWER($${idx + 1}) OR LOWER(last_name1) LIKE LOWER($${idx + 1}) OR LOWER(last_name2) LIKE LOWER($${idx + 1}))`
          ).join(' OR ')}
          ORDER BY last_name1, first_name
          LIMIT 20
        `;
        
        const matchedPeople = await pool.query(peopleQuery, searchTerms);
        
        if (matchedPeople.rows.length > 0) {
          const dnis = matchedPeople.rows.map(p => p.dni);
          const relatedIncidents = await pool.query(`
            SELECT DISTINCT i.code, i.status, i.location, i.type, i.description, i.creation_date, ip.person_dni
            FROM incidents i
            INNER JOIN incidents_people ip ON i.code = ip.incident_code
            WHERE ip.person_dni = ANY($1::text[])
            ORDER BY i.creation_date DESC
            LIMIT 20
          `, [dnis]);
          additionalData.incidenciasPersonas = relatedIncidents.rows;
          additionalData.personasCoincidentes = matchedPeople.rows;
        }
      }

      // Buscar matrículas en el query (formato: 1234ABC, 1234-ABC, etc.)
      const plateMatches = query.match(/\b\d{4}[\s-]?[A-Z]{3}\b/gi);
      
      if (plateMatches && plateMatches.length > 0) {
        const plates = plateMatches.map(p => p.replace(/[\s-]/g, ''));
        const matchedVehicles = await pool.query(`
          SELECT license_plate, brand, model, color, insurance, inspection_date
          FROM vehicles
          WHERE license_plate = ANY($1::text[])
        `, [plates]);
        
        if (matchedVehicles.rows.length > 0) {
          const licensePlates = matchedVehicles.rows.map(v => v.license_plate);
          const relatedIncidents = await pool.query(`
            SELECT DISTINCT i.code, i.status, i.location, i.type, i.description, i.creation_date, iv.vehicle_license_plate
            FROM incidents i
            INNER JOIN incidents_vehicles iv ON i.code = iv.incident_code
            WHERE iv.vehicle_license_plate = ANY($1::text[])
            ORDER BY i.creation_date DESC
            LIMIT 20
          `, [licensePlates]);
          additionalData.incidenciasVehiculos = relatedIncidents.rows;
          additionalData.vehiculosCoincidentes = matchedVehicles.rows;
        }
      }
      
      // Buscar por marca si se menciona alguna
      const brandKeywords = ['ford', 'seat', 'renault', 'volkswagen', 'peugeot', 'opel', 'citroen', 'mercedes', 'bmw', 'audi', 'toyota', 'nissan', 'honda'];
      const mentionedBrands = brandKeywords.filter(brand => lowerQuery.includes(brand));
      
      if (mentionedBrands.length > 0) {
        const brandSearchTerms = mentionedBrands.map(brand => `%${brand}%`);
        const matchedVehicles = await pool.query(`
          SELECT license_plate, brand, model, color, insurance, inspection_date
          FROM vehicles
          WHERE ${brandSearchTerms.map((_, idx) => 
            `LOWER(brand) LIKE LOWER($${idx + 1})`
          ).join(' OR ')}
          ORDER BY brand, model
          LIMIT 50
        `, brandSearchTerms);
        additionalData.vehiculosCoincidentes = matchedVehicles.rows;
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
      let dataContext = '\n\n--- DATOS ACTUALES DEL SISTEMA ---\n';
      
      if (systemContext) {
        dataContext += `\n📊 ESTADÍSTICAS GENERALES:
- Incidencias totales: ${systemContext.incidentsStats.total}
  - Abiertas: ${systemContext.incidentsStats.abiertas}
  - Cerradas: ${systemContext.incidentsStats.cerradas}
  - Campo brigada: ${systemContext.incidentsStats.brigade_field}
- Personas registradas: ${systemContext.peopleStats.total}
- Vehículos registrados: ${systemContext.vehiclesStats.total}
- Atestados: ${systemContext.atestadosStats.total} (${systemContext.atestadosStats.activos} activos, ${systemContext.atestadosStats.cerrados} cerrados)
- Usuarios: ${systemContext.usersStats.total} (${systemContext.usersStats.activos} activos, ${systemContext.usersStats.administradores} administradores)

📈 INCIDENCIAS POR TIPO:
${systemContext.incidentsByType.map(t => `- ${t.type}: ${t.cantidad}`).join('\n')}

🕐 INCIDENCIAS RECIENTES:
${systemContext.recentIncidents.map(i => `- [${i.code}] ${i.type} - ${i.location} (${i.status}) - ${new Date(i.creation_date).toLocaleDateString('es-ES')}`).join('\n')}
`;
      }

      // Añadir datos específicos si los hay
      if (Object.keys(specificData).length > 0) {
        dataContext += '\n📋 DATOS DETALLADOS RELEVANTES:\n';
        
        if (specificData.personas) {
          dataContext += `\n👥 Personas encontradas (${specificData.personas.length}):\n`;
          specificData.personas.forEach(p => {
            dataContext += `- DNI: ${p.dni}\n  Nombre: ${p.first_name} ${p.last_name1} ${p.last_name2 || ''}\n  Teléfono: ${p.phone_number || 'N/A'}\n  Dirección: ${p.address || 'N/A'}\n`;
          });
        }

        if (specificData.incidenciasPersonas) {
          dataContext += `\n🔗 Incidencias relacionadas con estas personas (${specificData.incidenciasPersonas.length}):\n`;
          specificData.incidenciasPersonas.forEach(i => {
            dataContext += `- Persona ${i.person_dni}: [${i.code}] ${i.type} - ${i.location} (${i.status})\n  Fecha: ${new Date(i.creation_date).toLocaleDateString('es-ES')}\n  Descripción: ${i.description ? i.description.substring(0, 100) + '...' : 'Sin descripción'}\n`;
          });
        }

        if (specificData.vehiculos) {
          dataContext += `\n🚗 Vehículos encontrados (${specificData.vehiculos.length}):\n`;
          specificData.vehiculos.forEach(v => {
            dataContext += `- Matrícula: ${v.license_plate}\n  Marca/Modelo: ${v.brand} ${v.model}\n  Color: ${v.color || 'Sin especificar'}\n  Seguro: ${v.insurance || 'N/A'}\n  ITV: ${v.inspection_date ? new Date(v.inspection_date).toLocaleDateString('es-ES') : 'N/A'}\n`;
          });
        }

        if (specificData.incidenciasVehiculos) {
          dataContext += `\n🔗 Incidencias relacionadas con estos vehículos (${specificData.incidenciasVehiculos.length}):\n`;
          specificData.incidenciasVehiculos.forEach(i => {
            dataContext += `- Vehículo ${i.vehicle_license_plate}: [${i.code}] ${i.type} - ${i.location} (${i.status})\n  Fecha: ${new Date(i.creation_date).toLocaleDateString('es-ES')}\n  Descripción: ${i.description ? i.description.substring(0, 100) + '...' : 'Sin descripción'}\n`;
          });
        }

        if (specificData.incidencias) {
          dataContext += `\n📋 Incidencias detalladas (${specificData.incidencias.length}):\n`;
          specificData.incidencias.forEach(i => {
            dataContext += `- [${i.code}] ${i.type} | ${i.status} | ${i.location} | ${new Date(i.creation_date).toLocaleDateString('es-ES')}\n  Descripción: ${i.description ? i.description.substring(0, 100) + '...' : 'Sin descripción'}\n`;
          });
        }

        if (specificData.atestados) {
          dataContext += `\n📝 Atestados (${specificData.atestados.length}):\n`;
          specificData.atestados.forEach(a => {
            dataContext += `- [${a.numero}] ${a.descripcion || 'Sin descripción'} - ${a.estado} (${a.num_diligencias} diligencias)\n`;
          });
        }

        if (specificData.incidenciasPorMes) {
          dataContext += `\nIncidencias por mes (últimos 12 meses):\n`;
          specificData.incidenciasPorMes.forEach(m => {
            const fecha = new Date(m.mes);
            dataContext += `- ${fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}: ${m.cantidad}\n`;
          });
        }

        if (specificData.incidenciasPorUbicacion) {
          dataContext += `\nIncidencias por ubicación:\n`;
          specificData.incidenciasPorUbicacion.forEach(u => {
            dataContext += `- ${u.location}: ${u.cantidad}\n`;
          });
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
