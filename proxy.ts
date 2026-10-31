import { NextResponse, type NextRequest } from "next/server";

// Older wallet requests return to /. Keep the complete query (including repeated
// keys and empty values) while handing reconciliation to the unchanged builder.
export function proxy(request: NextRequest) {
  const destination = new URL(request.url);
  if (destination.pathname === "/" && destination.searchParams.has("transactionHashes")) {
    destination.pathname = "/create";
    return NextResponse.redirect(destination);
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
