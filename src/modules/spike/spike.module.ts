import { Module } from '@nitrostack/core';
import { SpikeTools } from './spike.tools.js';

// ponytail: throwaway, delete with spike.tools.ts after gate G1
@Module({
  name: 'spike',
  description: 'Temporary host capability probe (S1/S2)',
  controllers: [SpikeTools]
})
export class SpikeModule {}
