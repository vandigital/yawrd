export type ApplicationStatus = 'pending' | 'approved' | 'rejected';
export type AgentAssociation = {
  network: 'testnet';
  projectId: string;
  applicationId: string;
  operatorAccountId: string;
  agentReference: string;
  consentVersion: 'agent-association-v1';
  authorizedAt: string;
};
export type Application = { id: string; accountId: string; introduction: string; status: ApplicationStatus; reviewerAccountId: string | null };
export type PersistedProject = { id: string; network: 'testnet'; creatorAccountId: string; name: string; description: string; objectives: string[]; participation: string; rewards: string };
export type ParticipantView = {
  accountId: string | null;
  role: 'public' | 'participant' | 'creator';
  application: Application | null;
  applications: Application[];
  restrictedContent: string | null;
};
