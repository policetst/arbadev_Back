import pool from './db/db.js'; 

/*
 * Añade una sola persona a la base de datos
 * @param {Object} person - datos de una persona
 * @returns {Promise<Object>} - persona añadida
*/
export const add_people = async (person) => {
  try {
    const query = `
      INSERT INTO people (dni, first_name, last_name1, last_name2, phone_number)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (dni) DO NOTHING
      RETURNING dni;
    `;
    const values = [
      person.dni,
      person.first_name,
      person.last_name1,
      person.last_name2,
      person.phone_number
    ];
    const result = await pool.query(query, values);
    return result.rows[0] || { dni: person.dni }; // Si ya existía, devuelve el dni
  } catch (error) {
    console.error('Error al añadir persona:', error);
    throw error;
  }
};

/*
 * Añade un solo vehículo a la base de datos
 * @param {Object} vehicle - datos del vehículo
 * @returns {Promise<Object>} - vehículo añadido
*/
export const add_vehicle = async (vehicle) => {
  try {
    const query = `
      INSERT INTO vehicles (brand, model, color, license_plate)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (license_plate) DO NOTHING
      RETURNING license_plate;
    `;
    const values = [
      vehicle.brand,
      vehicle.model,
      vehicle.color,
      vehicle.license_plate
    ];
    const result = await pool.query(query, values);
    return result.rows[0] || { license_plate: vehicle.license_plate }; // Si ya existía, devuelve matrícula
  } catch (error) {
    console.error('Error al añadir vehículo:', error);
    throw error;
  }
};
