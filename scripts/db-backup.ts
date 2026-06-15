import { initDatabase, closeDatabase } from '../src/database/index.js';
import { createBackup, restoreBackup, listBackups } from '../src/database/backup.js';
import { config } from '../src/config/index.js';

const command = process.argv[2];
const arg = process.argv[3];

async function main() {
  await initDatabase(config.databasePath);

  switch (command) {
    case 'backup': {
      const result = await createBackup(arg);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case 'restore': {
      if (!arg) {
        console.error('Usage: npm run db:restore <backup-path>');
        process.exit(1);
      }
      await restoreBackup(arg);
      console.log('Restore complete. Restart the server.');
      break;
    }
    case 'list': {
      const files = await listBackups(arg);
      if (files.length === 0) {
        console.log('No backups found');
      } else {
        for (const f of files) {
          console.log(`  ${f}`);
        }
      }
      break;
    }
    default:
      console.log('Usage:');
      console.log('  npm run db:backup [dir]     Create a backup');
      console.log('  npm run db:restore <path>   Restore from backup');
      console.log('  npm run db:list [dir]       List backups');
      process.exit(1);
  }

  closeDatabase();
}

main().catch((err) => {
  console.error('Backup command failed:', err);
  process.exit(1);
});
