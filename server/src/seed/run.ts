import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { SEED_PASSWORD, SEED_USERS } from './data.js';
import { seedDatabase } from './seed.js';

/**
 * CLI entry point: `npm run seed`
 * Kept separate from seed.ts so tests can import the seed function without
 * triggering a database connection.
 */
async function main(): Promise<void> {
  await connectDB();
  const summary = await seedDatabase();

  console.log('\nPathPoint_BD seed complete');
  console.log(`  database : ${env.MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}`);
  console.log(`  users    : ${summary.users} (removed ${summary.removedUsers} previous)`);
  console.log(`  rides    : ${summary.rides} (removed ${summary.removedRides} previous)`);
  console.log('\nDemo accounts (password for all): ' + SEED_PASSWORD);
  for (const user of SEED_USERS) {
    console.log(`  ${user.role.padEnd(6)} ${user.email}`);
  }
  console.log('');

  await disconnectDB();
}

main().catch(async (error) => {
  logger.error({ err: error }, 'seed failed');
  await disconnectDB().catch(() => undefined);
  process.exitCode = 1;
});
