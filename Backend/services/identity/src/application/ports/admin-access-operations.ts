/** Original policy belongs to the local administrative engine. */
export interface AdminAccessOperationsPort {
  demo(): { enabled: boolean; username?: string; password?: string };
  login(dto: { username: string; password: string }): Promise<{ accessToken: string }>;
}
