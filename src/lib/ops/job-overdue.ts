export function isJobOverdue(args: {
  lastSuccessAt: string | null;
  intervalSeconds: number;
  graceSeconds: number;
  now?: Date;
}): boolean {
  if (!args.lastSuccessAt) return true;
  const elapsed = (args.now ?? new Date()).getTime() - new Date(args.lastSuccessAt).getTime();
  return elapsed > (args.intervalSeconds + args.graceSeconds) * 1000;
}
