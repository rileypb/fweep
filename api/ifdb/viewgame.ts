import { handleIfdbVercelRequest, type VercelRequestLike, type VercelResponseLike } from './_shared';

export default async function handler(
  request: VercelRequestLike,
  response: VercelResponseLike,
): Promise<void> {
  await handleIfdbVercelRequest(request, response);
}
