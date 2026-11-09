import { GENESIS_YAW_001 } from './yaw-001.ts';

/** The reserved project ID in the existing Testnet namespace is authoritative.
 * This closes only new applications, never historical access or review.
 */
export function genesisApplicationsClosed(projectId: string, network = 'testnet'): boolean {
  return projectId === GENESIS_YAW_001.id && network === GENESIS_YAW_001.network;
}
