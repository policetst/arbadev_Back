import pool from './db/db.js'; 
/* 
 * function to add multiple people to the database
 * @param {Array<Object>} peopleArray - array with the data of each person
 * @returns {Promise<Array<Object>>} - array with the data of the people added
 * @throws {Error} - if there is an error adding the people
*/
export const add_people = async (peopleArray) => {
  try {
    const results = await Promise.all(peopleArray.map(async (people) => {
      const query = `
        INSERT INTO people (dni, first_name, last_name1, last_name2, phone_number)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING dni;
      `;
      const values = [
        people.dni,
        people.first_name,
        people.last_name1,
        people.last_name2,
        people.phone_number
      ];
      const result = await pool.query(query, values);
      return result.rows[0];
    }));
    return results;
  } catch (error) {
    console.error('Error al añadir personas:', error);
    throw error;
  }
}

/*
 * function to add multiple vehicles to the database
 * @param {Array<Object>} vehiclesArray - array with the data of each vehicle
 * @returns {Promise<Array<Object>>} - array with the data of the vehicles added
 * @throws {Error} - if there is an error adding the vehicles
*/
export const add_vehicle = async (vehiclesArray) => {
  try {
    const results = await Promise.all(vehiclesArray.map(async (vehicle) => {
      const query = `
        INSERT INTO vehicles (brand, model, color, license_plate)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const values = [
        vehicle.marca,
        vehicle.modelo,
        vehicle.color,
        vehicle.matricula
      ];
      const result = await pool.query(query, values);
      return result.rows[0];
    }));
    return results;
  } catch (error) {
    console.error('Error al añadir vehículos:', error);
    throw error;
  }
}
