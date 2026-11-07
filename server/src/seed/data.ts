/**
 * Deterministic demo dataset.
 *
 * Coordinates are real Dhaka and Chattogram landmarks, stored as
 * [longitude, latitude] so the 2dsphere indexes can be exercised meaningfully:
 * Uttara/Banani/Gulshan/Dhanmondi/Mirpur in Dhaka, and
 * GEC/Agrabad/Nasirabad/Oxygen/Khulshi/Pahartali in Chattogram.
 */

export interface SeedPlace {
  lng: number;
  lat: number;
  address: string;
}

export const DHAKA_PLACES = {
  uttaraSector7: { lng: 90.3948, lat: 23.8687, address: 'Uttara Sector 7, Dhaka' },
  uttaraSector3: { lng: 90.3902, lat: 23.8604, address: 'Uttara Sector 3, Dhaka' },
  airport: { lng: 90.408, lat: 23.8516, address: 'Hazrat Shahjalal International Airport, Dhaka' },
  banani: { lng: 90.4043, lat: 23.7937, address: 'Banani, Dhaka' },
  gulshan1: { lng: 90.4156, lat: 23.7806, address: 'Gulshan 1 Circle, Dhaka' },
  gulshan2: { lng: 90.4078, lat: 23.7925, address: 'Gulshan 2, Dhaka' },
  dhanmondi27: { lng: 90.3742, lat: 23.7461, address: 'Dhanmondi 27, Dhaka' },
  dhanmondi32: { lng: 90.376, lat: 23.7509, address: 'Dhanmondi 32, Dhaka' },
  motijheel: { lng: 90.417, lat: 23.733, address: 'Motijheel, Dhaka' },
  mirpur10: { lng: 90.3687, lat: 23.8069, address: 'Mirpur 10 Roundabout, Dhaka' },
  farmgate: { lng: 90.3899, lat: 23.7576, address: 'Farmgate, Dhaka' },
  shahbag: { lng: 90.395, lat: 23.738, address: 'Shahbagh, Dhaka' },
} as const satisfies Record<string, SeedPlace>;

export const CHATTOGRAM_PLACES = {
  gecCircle: { lng: 91.8322, lat: 22.3595, address: 'GEC Circle, Chattogram' },
  agrabad: { lng: 91.812, lat: 22.3271, address: 'Agrabad, Chattogram' },
  nasirabad: { lng: 91.825, lat: 22.3656, address: 'Nasirabad, Chattogram' },
  oxygenMor: { lng: 91.833, lat: 22.352, address: 'Oxygen Mor, Chattogram' },
  chawkbazar: { lng: 91.838, lat: 22.335, address: 'Chawkbazar, Chattogram' },
  pahartali: { lng: 91.8, lat: 22.37, address: 'Pahartali, Chattogram' },
  muradpur: { lng: 91.842, lat: 22.36, address: 'Muradpur, Chattogram' },
  khulshi: { lng: 91.81, lat: 22.355, address: 'Khulshi, Chattogram' },
} as const satisfies Record<string, SeedPlace>;

export const SEED_PASSWORD = 'PathPoint123';

export interface SeedUser {
  key: string;
  name: string;
  email: string;
  phone: string;
  role: 'rider' | 'driver';
  home: SeedPlace;
}

export const SEED_USERS: SeedUser[] = [
  {
    key: 'driver-uttara',
    name: 'Rafiq Hasan',
    email: 'driver.uttara@pathpoint.test',
    phone: '+8801700000001',
    role: 'driver',
    home: DHAKA_PLACES.uttaraSector7,
  },
  {
    key: 'driver-banani',
    name: 'Nusrat Jahan',
    email: 'driver.banani@pathpoint.test',
    phone: '+8801700000002',
    role: 'driver',
    home: DHAKA_PLACES.banani,
  },
  {
    key: 'driver-gulshan',
    name: 'Imran Chowdhury',
    email: 'driver.gulshan@pathpoint.test',
    phone: '+8801700000003',
    role: 'driver',
    home: DHAKA_PLACES.gulshan2,
  },
  {
    key: 'driver-dhanmondi',
    name: 'Sadia Islam',
    email: 'driver.dhanmondi@pathpoint.test',
    phone: '+8801700000004',
    role: 'driver',
    home: DHAKA_PLACES.dhanmondi32,
  },
  {
    key: 'driver-mirpur',
    name: 'Tanvir Ahmed',
    email: 'driver.mirpur@pathpoint.test',
    phone: '+8801700000005',
    role: 'driver',
    home: DHAKA_PLACES.mirpur10,
  },
  {
    key: 'driver-gec',
    name: 'Farhana Akter',
    email: 'driver.gec@pathpoint.test',
    phone: '+8801700000006',
    role: 'driver',
    home: CHATTOGRAM_PLACES.gecCircle,
  },
  {
    key: 'driver-agrabad',
    name: 'Mahmudul Karim',
    email: 'driver.agrabad@pathpoint.test',
    phone: '+8801700000007',
    role: 'driver',
    home: CHATTOGRAM_PLACES.agrabad,
  },
  {
    key: 'rider-dhanmondi',
    name: 'Sabrina Rahman',
    email: 'rider.dhanmondi@pathpoint.test',
    phone: '+8801700000008',
    role: 'rider',
    home: DHAKA_PLACES.dhanmondi27,
  },
  {
    key: 'rider-agrabad',
    name: 'Arif Hossain',
    email: 'rider.agrabad@pathpoint.test',
    phone: '+8801700000009',
    role: 'rider',
    home: CHATTOGRAM_PLACES.agrabad,
  },
];

export interface SeedRide {
  driverKey: string;
  origin: SeedPlace;
  destination: SeedPlace;
  /** 0 = tomorrow, 1 = the day after. Keeps seeded rides in the future. */
  dayOffset: number;
  hour: number;
  minute: number;
  seatsTotal: number;
  farePerSeat: number;
  vehicle: { make: string; model: string; plate: string; ac: boolean };
  genderPreference?: 'any' | 'female' | 'male';
  maxDetourMeters?: number;
}

export const SEED_RIDES: SeedRide[] = [
  {
    driverKey: 'driver-uttara',
    origin: DHAKA_PLACES.uttaraSector7,
    destination: DHAKA_PLACES.motijheel,
    dayOffset: 0,
    hour: 7,
    minute: 45,
    seatsTotal: 3,
    farePerSeat: 120,
    vehicle: { make: 'Toyota', model: 'Corolla', plate: 'DHAKA METRO-GA-12-3456', ac: true },
  },
  {
    driverKey: 'driver-uttara',
    origin: DHAKA_PLACES.uttaraSector3,
    destination: DHAKA_PLACES.gulshan2,
    dayOffset: 0,
    hour: 8,
    minute: 30,
    seatsTotal: 2,
    farePerSeat: 70,
    vehicle: { make: 'Toyota', model: 'Corolla', plate: 'DHAKA METRO-GA-12-3456', ac: true },
  },
  {
    driverKey: 'driver-banani',
    origin: DHAKA_PLACES.banani,
    destination: DHAKA_PLACES.dhanmondi27,
    dayOffset: 0,
    hour: 8,
    minute: 15,
    seatsTotal: 4,
    farePerSeat: 80,
    vehicle: { make: 'Honda', model: 'Civic', plate: 'DHAKA METRO-KHA-45-7890', ac: true },
    genderPreference: 'female',
    maxDetourMeters: 2_500,
  },
  {
    driverKey: 'driver-gulshan',
    origin: DHAKA_PLACES.gulshan2,
    destination: DHAKA_PLACES.shahbag,
    dayOffset: 0,
    hour: 8,
    minute: 0,
    seatsTotal: 3,
    farePerSeat: 90,
    vehicle: { make: 'Mitsubishi', model: 'Lancer', plate: 'DHAKA METRO-GA-33-1122', ac: true },
  },
  {
    driverKey: 'driver-gulshan',
    origin: DHAKA_PLACES.gulshan1,
    destination: DHAKA_PLACES.banani,
    dayOffset: 0,
    hour: 9,
    minute: 0,
    seatsTotal: 2,
    farePerSeat: 40,
    vehicle: { make: 'Mitsubishi', model: 'Lancer', plate: 'DHAKA METRO-GA-33-1122', ac: true },
  },
  {
    driverKey: 'driver-dhanmondi',
    origin: DHAKA_PLACES.dhanmondi32,
    destination: DHAKA_PLACES.banani,
    dayOffset: 1,
    hour: 9,
    minute: 0,
    seatsTotal: 4,
    farePerSeat: 85,
    vehicle: { make: 'Nissan', model: 'Sunny', plate: 'DHAKA METRO-CHA-77-4455', ac: false },
  },
  {
    driverKey: 'driver-mirpur',
    origin: DHAKA_PLACES.mirpur10,
    destination: DHAKA_PLACES.gulshan1,
    dayOffset: 0,
    hour: 7,
    minute: 30,
    seatsTotal: 3,
    farePerSeat: 70,
    vehicle: { make: 'Suzuki', model: 'Ciaz', plate: 'DHAKA METRO-GA-88-9012', ac: true },
  },
  {
    driverKey: 'driver-gec',
    origin: CHATTOGRAM_PLACES.gecCircle,
    destination: CHATTOGRAM_PLACES.agrabad,
    dayOffset: 0,
    hour: 8,
    minute: 0,
    seatsTotal: 3,
    farePerSeat: 60,
    vehicle: { make: 'Toyota', model: 'Axio', plate: 'CHATTO METRO-GA-11-2233', ac: true },
  },
  {
    driverKey: 'driver-gec',
    origin: CHATTOGRAM_PLACES.nasirabad,
    destination: CHATTOGRAM_PLACES.oxygenMor,
    dayOffset: 0,
    hour: 8,
    minute: 20,
    seatsTotal: 4,
    farePerSeat: 50,
    vehicle: { make: 'Toyota', model: 'Axio', plate: 'CHATTO METRO-GA-11-2233', ac: true },
  },
  {
    driverKey: 'driver-agrabad',
    origin: CHATTOGRAM_PLACES.khulshi,
    destination: CHATTOGRAM_PLACES.chawkbazar,
    dayOffset: 0,
    hour: 7,
    minute: 40,
    seatsTotal: 3,
    farePerSeat: 55,
    vehicle: { make: 'Honda', model: 'Vezel', plate: 'CHATTO METRO-KHA-55-6677', ac: true },
  },
  {
    driverKey: 'driver-agrabad',
    origin: CHATTOGRAM_PLACES.pahartali,
    destination: CHATTOGRAM_PLACES.muradpur,
    dayOffset: 1,
    hour: 9,
    minute: 10,
    seatsTotal: 2,
    farePerSeat: 45,
    vehicle: { make: 'Honda', model: 'Vezel', plate: 'CHATTO METRO-KHA-55-6677', ac: true },
  },
];
