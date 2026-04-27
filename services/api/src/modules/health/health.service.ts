export const healthService = () => ({
  check: () => ({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }),
});

export type HealthService = ReturnType<typeof healthService>;
