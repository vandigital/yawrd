/** Explicit public presentation data only. Never map a creation plan or agent config here. */
export type PublicCreator = {
  accountId: string;
  avatar?: "sea" | "tide" | "kelp" | "coral" | "amber" | "lilac";
  displayName?: string;
  bio?: string;
  nearSocialUrl?: string;
};

export type PublicYawrdInput = {
  id: string;
  name: string;
  description: string;
  creator: PublicCreator;
  objectives: readonly string[];
  participation: string;
  rewards: string;
};

/** Links are explicitly supplied, never inferred from a wallet account. */
function nearSocialLink(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "near.social" || url.port || url.username || url.password || url.pathname === "/") return undefined;
    return url.href;
  } catch { return undefined; }
}

export function toPublicYawrd(input: PublicYawrdInput) {
  // Field-by-field allowlist also drops extra properties from structurally compatible inputs.
  return {
    id: input.id,
    name: input.name,
    description: input.description,
    status: "Fixture preview" as const,
    creator: {
      accountId: input.creator.accountId,
      avatar: input.creator.avatar ?? "sea",
      displayName: input.creator.displayName,
      bio: input.creator.bio,
      nearSocialUrl: nearSocialLink(input.creator.nearSocialUrl),
    },
    objectives: [...input.objectives],
    participation: input.participation,
    rewards: input.rewards,
  };
}

export type PublicYawrd = ReturnType<typeof toPublicYawrd>;

// Authored public examples, unrelated to deployment or connected wallet state.
const fixtures: readonly PublicYawrdInput[] = [{
  id: "the-common-table",
  name: "The Common Table",
  description: "A shared place to bring neighbors together around food, ideas, and small projects that make our corner of the city feel more connected.",
  creator: {
    accountId: "common-table.demo.near",
    avatar: "sea",
    displayName: "The Common Table host",
    bio: "An illustrative creator profile for this Yawrd preview. The wallet account is an example; ownership has not been verified.",
  },
  objectives: [
    "Sketch a neighborhood gathering around a shared meal.",
    "Collect ideas for small projects neighbors could build together.",
    "Draft shared expectations for welcoming and supporting contributors.",
  ],
  participation: "The idea is to welcome neighbors who enjoy hosting, cooking, or making things together. Participation is being explored; applications are not open and no Crew Members are confirmed.",
  rewards: "A future Yawrd could describe how contributions are recognized and how Stewards review Reward Requests. No rewards are offered here, and no Project Funds have been committed or verified.",
}];

export function getPublicYawrd(id: string): PublicYawrd | undefined {
  const fixture = fixtures.find((project) => project.id === id);
  return fixture ? toPublicYawrd(fixture) : undefined;
}
