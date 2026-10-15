import { handleApi } from "@/lib/api/v1/gateway";

export const dynamic = "force-dynamic";

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return handleApi(request, path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
