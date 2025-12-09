import { worker } from './worker';

console.log('Media Worker started...');

worker.on('completed', (job) => {
    console.log(`${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
    console.log(`${job?.id} has failed with ${err.message}`);
});

process.on('SIGINT', async () => {
    console.log('Shutting down worker...');
    await worker.close();
    process.exit(0);
});
