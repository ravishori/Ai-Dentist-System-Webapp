import { loadConfig, type AppConfig } from "@dentalcare/config";
import {
  createNotificationDeliveryPort,
  FakeSmsDeliveryAdapter,
  FailClosedSmsDeliveryAdapter,
  InvitationApplicationService,
  OtpAuthenticationAdapter,
  OtpChallengeService,
  otpConfigFromApp,
  RegistrationCompletionService,
} from "@dentalcare/application";
import type { SmsDeliveryPort } from "@dentalcare/domain";
import {
  createPrismaClient,
  PrismaInvitationStore,
  PrismaOtpChallengeStore,
  PrismaPractitionerRepository,
  PrismaRateLimitBucketStore,
  PrismaRegistrationSessionStore,
  PrismaRegistrationSupport,
  PrismaSessionStore,
  PrismaUserIdentityDirectory,
} from "@dentalcare/db";
import { getAuthenticationPort } from "../auth/port";

export type IdentityRuntime = {
  config: AppConfig;
  otp: OtpChallengeService;
  invitations: InvitationApplicationService;
  registration: RegistrationCompletionService;
  users: PrismaRegistrationSupport;
  otpAuth: OtpAuthenticationAdapter;
};

let runtimePromise: Promise<IdentityRuntime> | undefined;

function createSmsAdapter(config: AppConfig): SmsDeliveryPort {
  if (
    config.SMS_PROVIDER === "fake" &&
    (config.NODE_ENV !== "production" || config.OTP_ALLOW_FAKE_SMS === "true")
  ) {
    return new FakeSmsDeliveryAdapter();
  }
  return new FailClosedSmsDeliveryAdapter();
}

async function buildIdentityRuntime(): Promise<IdentityRuntime> {
  const config = loadConfig();
  const prisma = createPrismaClient();
  const identityDirectory = new PrismaUserIdentityDirectory(prisma);
  const sessions = new PrismaSessionStore(prisma);

  const otpCfg = otpConfigFromApp(config);
  void otpCfg;
  const pepper = config.OTP_PEPPER;
  const otpIssuer = config.OTP_ISSUER;
  if (!pepper || !otpIssuer || !config.AUTH_SESSION_SECRET) {
    throw new Error("identity_runtime_requires_otp_config");
  }

  const authPort = getAuthenticationPort();
  const otpAuth =
    authPort.providerId === "otp"
      ? (authPort as OtpAuthenticationAdapter)
      : new OtpAuthenticationAdapter(
          {
            issuer: otpIssuer,
            sessionSecret: config.AUTH_SESSION_SECRET,
            sessionTtlSeconds: config.AUTH_SESSION_TTL_SECONDS,
            cookieSecure:
              config.AUTH_COOKIE_SECURE === "true" ||
              (config.AUTH_COOKIE_SECURE !== "false" && config.NODE_ENV === "production"),
            appBaseUrl: config.APP_BASE_URL,
          },
          identityDirectory,
          sessions,
        );

  const email = await createNotificationDeliveryPort(config);
  const rateLimits = new PrismaRateLimitBucketStore(prisma);
  const otp = new OtpChallengeService(
    {
      pepper,
      length: config.OTP_LENGTH,
      ttlSeconds: config.OTP_TTL_SECONDS,
      maxAttempts: config.OTP_MAX_ATTEMPTS,
      resendCooldownSeconds: config.OTP_RESEND_COOLDOWN_SECONDS,
      maxResends: config.OTP_MAX_RESENDS,
      requestRateLimit: {
        windowSeconds: config.OTP_RATE_LIMIT_WINDOW_SECONDS,
        maxRequests: config.OTP_RATE_LIMIT_MAX_REQUESTS,
      },
      verifyRateLimit: {
        windowSeconds: config.OTP_RATE_LIMIT_WINDOW_SECONDS,
        maxRequests: config.OTP_VERIFY_RATE_LIMIT_MAX,
      },
    },
    new PrismaOtpChallengeStore(prisma),
    rateLimits,
    email,
    createSmsAdapter(config),
  );

  const sessionStore = new PrismaRegistrationSessionStore(prisma);
  const invitations = new InvitationApplicationService(
    pepper,
    new PrismaInvitationStore(prisma),
    sessionStore,
    rateLimits,
    config.REGISTRATION_SESSION_TTL_SECONDS,
    {
      windowSeconds: config.OTP_RATE_LIMIT_WINDOW_SECONDS,
      maxRequests: config.OTP_RATE_LIMIT_MAX_REQUESTS,
    },
  );

  const users = new PrismaRegistrationSupport(prisma);
  const registration = new RegistrationCompletionService({
    sessions: sessionStore,
    createUser: (input) => users.createUser({ ...input, otpIssuer }),
    findUserByEmailOrPhone: (input) => users.findUserByEmailOrPhone(input),
    createMembership: (input) => users.createMembership(input),
    createPatient: (input) => users.createPatient(input),
    linkPatientUser: (input) => users.linkPatientUser(input),
    practitioners: new PrismaPractitionerRepository(prisma),
    attachAddress: (input) => users.attachAddress(input),
    otpAuth,
    actorUserIdForAudit: "system_registration",
  });

  return { config, otp, invitations, registration, users, otpAuth };
}

export function getIdentityRuntime(): Promise<IdentityRuntime> {
  if (!runtimePromise) {
    runtimePromise = buildIdentityRuntime();
  }
  return runtimePromise;
}
