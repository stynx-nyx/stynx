export class AuthMiddleware {
  use(req: { headers?: Record<string, string> }, _res: unknown, next: () => void) {
    const authHeader = req.headers?.authorization;
    if (authHeader?.includes('jwt')) {
      next();
      return;
    }
    next();
  }
}
