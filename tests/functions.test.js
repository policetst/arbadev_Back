import { jest } from '@jest/globals';
import pool from './db/db.js';
import { add_people, show_people, add_vehicle } from './functions.js';

// Mock the database pool
jest.mock('./db/db.js', () => ({
  default: {
    query: jest.fn()
  }
}));

describe('Database Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('add_people', () => {
    test('test_add_people_successfully_inserts_new_person', async () => {
      const mockPerson = {
        dni: '12345678A',
        first_name: 'Juan',
        last_name1: 'García',
        last_name2: 'López',
        phone_number: '123456789'
      };

      const mockResult = {
        rows: [{ dni: '12345678A' }]
      };

      pool.query.mockResolvedValue(mockResult);

      const result = await add_people(mockPerson);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO people'),
        ['12345678A', 'Juan', 'García', 'López', '123456789']
      );
      expect(result).toEqual({ dni: '12345678A' });
    });

    test('test_add_people_handles_duplicate_dni_conflict', async () => {
      const mockPerson = {
        dni: '12345678A',
        first_name: 'Juan',
        last_name1: 'García',
        last_name2: 'López',
        phone_number: '123456789'
      };

      const mockResult = {
        rows: []
      };

      pool.query.mockResolvedValue(mockResult);

      const result = await add_people(mockPerson);

      expect(result).toEqual({ dni: '12345678A' });
    });

    test('test_add_people_handles_database_connection_error', async () => {
      const mockPerson = {
        dni: '12345678A',
        first_name: 'Juan',
        last_name1: 'García',
        last_name2: 'López',
        phone_number: '123456789'
      };

      const mockError = new Error('Database connection failed');
      pool.query.mockRejectedValue(mockError);

      await expect(add_people(mockPerson)).rejects.toThrow('Database connection failed');
    });
  });

  describe('show_people', () => {
    test('test_show_people_returns_all_records', async () => {
      const mockPeople = [
        {
          dni: '12345678A',
          first_name: 'Juan',
          last_name1: 'García',
          last_name2: 'López',
          phone_number: '123456789'
        },
        {
          dni: '87654321B',
          first_name: 'María',
          last_name1: 'Rodríguez',
          last_name2: 'Martín',
          phone_number: '987654321'
        }
      ];

      const mockResult = {
        rows: mockPeople
      };

      pool.query.mockResolvedValue(mockResult);

      const result = await show_people();

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM people');
      expect(result).toEqual(mockPeople);
    });
  });

  describe('add_vehicle', () => {
    test('test_add_vehicle_successfully_inserts_new_vehicle', async () => {
      const mockVehicle = {
        brand: 'Toyota',
        model: 'Corolla',
        color: 'Blue',
        license_plate: 'ABC123'
      };

      const mockResult = {
        rows: [{ license_plate: 'ABC123' }]
      };

      pool.query.mockResolvedValue(mockResult);

      const result = await add_vehicle(mockVehicle);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO vehicles'),
        ['Toyota', 'Corolla', 'Blue', 'ABC123']
      );
      expect(result).toEqual({ license_plate: 'ABC123' });
    });

    test('test_add_vehicle_handles_duplicate_license_plate_conflict', async () => {
      const mockVehicle = {
        brand: 'Toyota',
        model: 'Corolla',
        color: 'Blue',
        license_plate: 'ABC123'
      };

      const mockResult = {
        rows: []
      };

      pool.query.mockResolvedValue(mockResult);

      const result = await add_vehicle(mockVehicle);

      expect(result).toEqual({ license_plate: 'ABC123' });
    });
  });
});