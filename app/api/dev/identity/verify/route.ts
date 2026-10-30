import { developmentIdentityPost } from "../../../../../src/identity/development";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return developmentIdentityPost(request, "verify"); }

export const GET = POST;
export const HEAD = POST;
export const OPTIONS = POST;
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
