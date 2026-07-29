import { Prisma } from '@prisma/client';
import type { AuthenticatedPrincipal } from '../../security/principal';
import { logger } from '../../shared/logger';
import { getPrisma } from '../../infrastructure/db/prisma-client';

export interface UserProfile {
  id: number;
  email?: string;
  phone?: string;
  name?: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  profile?: {
    displayName?: string;
    username?: string;
    avatarUrl?: string;
    avatarMedia?: {
      url?: string;
    };
  };
  auth?: {
    email?: string;
    phone?: string;
  };
}

export async function getOrProvisionUser(principal: AuthenticatedPrincipal): Promise<UserProfile> {
  const subject = principal.sub;
  const email = principal.email?.trim().toLowerCase() || undefined;

  const client = getPrisma();

  try {
    // Check for existing Central Auth link
    const existingLink = await client.userCentralAuthLink.findUnique({
      where: { subject },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (existingLink) {
      logger.debug(
        { subject, userId: existingLink.userId },
        '[auth] Found existing Central Auth link',
      );
      const userAuth = await client.userAuth.findFirst({
        where: { userId: existingLink.userId, provider: 'CENTRAL_AUTH' },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return formatUserProfile(existingLink.user as any, userAuth);
    }

    // Check for eligible user by email
    if (email) {
      const existingAuth = await client.userAuth.findFirst({
        where: { email, provider: 'CENTRAL_AUTH' },
      });

      if (existingAuth) {
        logger.debug({ email, userId: existingAuth.userId }, '[auth] Found eligible user by email');

        const user = await client.user.findUnique({
          where: { id: existingAuth.userId },
          include: { profile: true },
        });

        if (user) {
          // Auto-link: create Central Auth link if not already linked
          const existingCentralLink = await client.userCentralAuthLink.findFirst({
            where: { userId: existingAuth.userId },
          });

          if (!existingCentralLink) {
            await client.userCentralAuthLink.create({
              data: {
                userId: existingAuth.userId,
                subject,
                linkMethod: 'email_auto',
              },
            });

            logger.debug(
              { email, userId: existingAuth.userId, subject },
              '[auth] Auto-linked existing user to Central Auth subject',
            );
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return formatUserProfile(user as any, existingAuth);
        }
      }
    }

    // JIT provisioning: create new user with transaction
    logger.debug({ subject, email }, '[auth] Creating new user via JIT provisioning');

    const result = await client.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {}, // createdAt and updatedAt are auto-set
      });

      // Link to Central Auth
      await tx.userCentralAuthLink.create({
        data: {
          userId: newUser.id,
          subject,
          linkMethod: 'jit',
        },
      });

      // Store email/phone if present
      let userAuth: { email?: string | null; phone?: string | null } | null = null;
      if (email) {
        const createdAuth = await tx.userAuth.create({
          data: {
            userId: newUser.id,
            email,
            provider: 'CENTRAL_AUTH',
            emailVerifiedAt: new Date(), // Trusted from Central Auth
          },
        });
        userAuth = { email: createdAuth.email, phone: createdAuth.phone };
      }

      // Create profile with generated username
      const username = generateUsername(email || principal.name || subject);
      const displayName = principal.name || email || username;

      const profile = await tx.userProfile.create({
        data: {
          userId: newUser.id,
          username,
          displayName,
        },
      });

      logger.debug({ userId: newUser.id, username, subject }, '[auth] JIT provisioned new user');

      return { user: newUser, profile, userAuth };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return formatUserProfile(result.user as any, result.userAuth);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // Log sanitized error info
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error(
        {
          code: error.code,
          meta: error.meta,
          target: error.meta?.target,
        },
        '[auth] Database error during JIT provisioning',
      );
    } else {
      logger.error(
        {
          message: err.message,
          name: err.name,
        },
        '[auth] Error during JIT provisioning',
      );
    }

    throw error;
  }
}

function generateUsername(baseString: string): string {
  const base =
    baseString
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 20) || 'user';

  const timestamp = Date.now().toString().slice(-6);
  return `${base}${timestamp}`.substring(0, 30);
}

function formatUserProfile(
  user: {
    id: number;
    profile?: { displayName?: string | null; username?: string | null; avatarUrl?: string | null };
  },
  userAuth?: { email?: string | null; phone?: string | null } | null,
): UserProfile {
  const profile = user.profile || {};

  return {
    id: user.id,
    email: userAuth?.email || undefined,
    phone: userAuth?.phone || undefined,
    name: (profile.displayName || profile.username || userAuth?.email) as string | undefined,
    displayName: (profile.displayName || undefined) as string | undefined,
    username: (profile.username || undefined) as string | undefined,
    avatarUrl: (profile.avatarUrl || undefined) as string | undefined,
    profile: {
      displayName: (profile.displayName || undefined) as string | undefined,
      username: (profile.username || undefined) as string | undefined,
      avatarUrl: (profile.avatarUrl || undefined) as string | undefined,
    },
    auth: {
      email: userAuth?.email || undefined,
      phone: userAuth?.phone || undefined,
    },
  };
}
