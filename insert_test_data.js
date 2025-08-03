import { config } from 'dotenv';
import pkg from 'pg';

const { Pool } = pkg;

// Cargar variables de entorno
config();

// Configuración de la base de datos
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function insertTestData() {
    try {
        console.log('🔗 Conectando a la base de datos...');
        
        // Insertar datos de prueba en la tabla people
        console.log('👥 Insertando datos de prueba en la tabla people...');
        const peopleData = [
            ['12345678A', 'Juan', 'García', 'López', '666123456'],
            ['87654321B', 'María', 'Rodríguez', 'Martín', '666789012'],
            ['11111111C', 'Pedro', 'Sánchez', 'González', '666345678'],
            ['22222222D', 'Ana', 'Fernández', 'Ruiz', '666901234'],
            ['33333333E', 'Luis', 'Martínez', 'Jiménez', '666567890']
        ];

        for (const person of peopleData) {
            const query = `
                INSERT INTO people (dni, first_name, last_name1, last_name2, phone_number)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (dni) DO NOTHING
            `;
            await pool.query(query, person);
        }

        // Insertar datos de prueba en la tabla vehicles
        console.log('🚗 Insertando datos de prueba en la tabla vehicles...');
        const vehiclesData = [
            ['1234ABC', 'Toyota', 'Corolla', 'Blanco'],
            ['5678DEF', 'Ford', 'Focus', 'Azul'],
            ['9012GHI', 'Volkswagen', 'Golf', 'Rojo'],
            ['3456JKL', 'Renault', 'Clio', 'Negro'],
            ['7890MNO', 'Seat', 'Ibiza', 'Gris']
        ];

        for (const vehicle of vehiclesData) {
            const query = `
                INSERT INTO vehicles (license_plate, brand, model, color)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (license_plate) DO NOTHING
            `;
            await pool.query(query, vehicle);
        }

        // Verificar los datos insertados
        console.log('✅ Verificando datos insertados...');
        
        const peopleResult = await pool.query('SELECT COUNT(*) FROM people');
        console.log(`📊 Total de personas en la base de datos: ${peopleResult.rows[0].count}`);
        
        const vehiclesResult = await pool.query('SELECT COUNT(*) FROM vehicles');
        console.log(`📊 Total de vehículos en la base de datos: ${vehiclesResult.rows[0].count}`);

        // Mostrar algunos ejemplos
        console.log('\n👥 Ejemplos de personas:');
        const samplePeople = await pool.query('SELECT * FROM people LIMIT 3');
        samplePeople.rows.forEach(person => {
            console.log(`- ${person.first_name} ${person.last_name1} ${person.last_name2} (${person.dni}) - ${person.phone_number}`);
        });

        console.log('\n🚗 Ejemplos de vehículos:');
        const sampleVehicles = await pool.query('SELECT * FROM vehicles LIMIT 3');
        sampleVehicles.rows.forEach(vehicle => {
            console.log(`- ${vehicle.brand} ${vehicle.model} (${vehicle.license_plate}) - ${vehicle.color}`);
        });

        console.log('\n✅ Datos de prueba insertados correctamente!');

    } catch (error) {
        console.error('❌ Error al insertar datos de prueba:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await pool.end();
    }
}

// Ejecutar el script
insertTestData();