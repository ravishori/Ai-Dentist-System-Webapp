export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { loadConfig, createLogger } = await import("@dentalcare/config");
  const config = loadConfig();
  const logger = createLogger(config);
  logger.info("web application configuration loaded", {
    service: "web",
    milestone: "M1",
    nodeEnv: config.NODE_ENV,
    authProvider: config.AUTH_PROVIDER,
  });
}
