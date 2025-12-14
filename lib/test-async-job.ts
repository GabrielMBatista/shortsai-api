#!/usr/bin/env node
/**
 * Quick diagnostic script to test the async job system
 * Run with: npx tsx lib/test-async-job.ts
 */

import { scheduleGenerationQueue } from './queues';

async function testJobSystem() {
    console.log('========================================');
    console.log('Testing Async Job System');
    console.log('========================================\n');

    try {
        // 1. Test queue connection
        console.log('1. Testing queue connection...');
        const isPaused = await scheduleGenerationQueue.isPaused();
        console.log(`   Queue paused: ${isPaused}`);

        const jobCounts = await scheduleGenerationQueue.getJobCounts();
        console.log(`   Job counts:`, jobCounts);

        // 2. Add a test job
        console.log('\n2. Adding test job...');
        const testJob = await scheduleGenerationQueue.add('test-job', {
            userId: 'test-user',
            personaId: 'test-persona',
            message: 'cronograma para a semana',
            channelContext: ''
        });

        console.log(`   ✅ Job created with ID: ${testJob.id}`);

        // 3. Wait a bit and check status
        console.log('\n3. Waiting 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        const job = await scheduleGenerationQueue.getJob(testJob.id!);
        if (job) {
            const state = await job.getState();
            console.log(`   Job state: ${state}`);
            console.log(`   Job progress: ${job.progress}`);
        } else {
            console.log(`   ⚠️  Job not found`);
        }

        console.log('\n========================================');
        console.log('Test complete. Check worker logs for processing.');
        console.log('========================================');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

testJobSystem();
