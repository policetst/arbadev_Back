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


/**
 * Muestra personas de la base de datos
 * @returns {promise}
 */
export const show_people = async () => {
  const query = 'SELECT * FROM people';
  const result = await pool.query(query);
  return result.rows;

};

// Muestra los vehiculos de la base de datos
export const show_vehicles = async () => {
  const query = 'SELECT * FROM vehicles';
  const result = await pool.query(query);
  return result.rows;

};


// Obtiene las incidencias de las personas 
export const getPersonIncidents = async (req, res) => {
  const { dni } = req.params;
  console.log('DNI recibido en la petición:', dni);
  const query = `
  SELECT 
    i.code AS incident_code,
    i.creation_date,
    i.status
  FROM 
    incidents i
  JOIN 
    incidents_people ip ON i.code = ip.incident_code
  WHERE 
    ip.person_dni = $1;
  `;

  try {
    const result = await pool.query(query, [dni]);
    res.status(200).json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

// Obtiene las incidencias de los vehiculos 
export const getVehicleIncidents = async (req, res) => {
  const { license_plate } = req.params;
  console.log('Matricula recibida en la petición:', license_plate);
  const query = `
  SELECT 
    i.code AS incident_code,
    i.creation_date,
    i.status
  FROM 
      incidents i
  JOIN 
      incidents_vehicles iv ON i.code = iv.incident_code
  WHERE 
      iv.vehicle_license_plate = $1;
  `;

  try {
    const result = await pool.query(query, [license_plate]);
    res.status(200).json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};


// Obtiene las personas relaciondas con otras personas a traves de las incidencias
export const getPeopleRelPerson = async (req, res) => {
  const { dni } = req.params;

  const query = `
    SELECT 
      p.dni,
      p.first_name,
      p.last_name1,
      p.last_name2,
      ip.incident_code
    FROM incidents_people ip
    JOIN people p ON ip.person_dni = p.dni
    WHERE ip.incident_code IN (
      SELECT incident_code
      FROM incidents_people
      WHERE person_dni = $1
    )
    AND p.dni <> $1;
  `;

  try {
    const result = await pool.query(query, [dni]);
    res.status(200).json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

// Obtiene los vehiculos relaciondos con las personas a traves de las incidencias
export const getVehiclesRelPerson = async (req, res) => {
  const { dni } = req.params;

  const query = `
    SELECT 
      v.license_plate,
      v.brand,
      v.model,
      iv.incident_code
    FROM incidents_vehicles iv
    JOIN vehicles v ON iv.vehicle_license_plate = v.license_plate
    WHERE iv.incident_code IN (
      SELECT incident_code
      FROM incidents_people
      WHERE person_dni = $1
    );
  `;

  try {
    const result = await pool.query(query, [dni]);
    res.status(200).json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

// Obtiene las personas que coincien con un vehiculo en incidencias
export const getPeopleRelVehicle = async (req, res) => {
  const { license_plate } = req.params;

  const query = `
    SELECT 
      p.dni,
      p.first_name,
      p.last_name1,
      p.last_name2,
      ip.incident_code
    FROM incidents_people ip
    JOIN people p ON ip.person_dni = p.dni
    WHERE ip.incident_code IN (
      SELECT incident_code
      FROM incidents_vehicles
      WHERE vehicle_license_plate = $1
    );
  `;

  try {
    const result = await pool.query(query, [license_plate]);
    res.status(200).json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

// Obtiene los vehiculos que coincien con un vehiculo en incidencias
export const getVehiclesRelVehicle = async (req, res) => {
  const { license_plate } = req.params;

  const query = `
    SELECT 
      v.license_plate,
      v.brand,
      v.model,
      iv.incident_code
    FROM incidents_vehicles iv
    JOIN vehicles v ON iv.vehicle_license_plate = v.license_plate
    WHERE iv.incident_code IN (
      SELECT incident_code
      FROM incidents_vehicles
      WHERE vehicle_license_plate = $1
    )
    AND v.license_plate <> $1;
  `;

  try {
    const result = await pool.query(query, [license_plate]);
    res.status(200).json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
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
