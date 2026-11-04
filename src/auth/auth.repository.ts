import { Injectable } from '@nestjs/common';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  deviceSessions,
  DeviceSessionRow,
  devices,
  uploadSignatures,
  users,
  UserRow,
} from '../database/schema';
import { newId } from '../common/utils/ids';
import { parkedHandle } from './handles';

export interface GithubIdentity {
  githubId: number;
  handle: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface NewDevice {
  userId: string;
  name: string;
  platform: string;
  publicKey: string;
  tokenHash: string;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async createSession(
    session: typeof deviceSessions.$inferInsert,
  ): Promise<void> {
    await this.database.db.insert(deviceSessions).values(session);
  }

  async findSession(id: string): Promise<DeviceSessionRow | undefined> {
    const [row] = await this.database.db
      .select()
      .from(deviceSessions)
      .where(eq(deviceSessions.id, id))
      .limit(1);
    return row;
  }

  async findPendingSessionByCode(
    userCode: string,
  ): Promise<DeviceSessionRow | undefined> {
    const [row] = await this.database.db
      .select()
      .from(deviceSessions)
      .where(
        and(
          eq(deviceSessions.userCode, userCode),
          eq(deviceSessions.status, 'pending'),
        ),
      )
      .limit(1);
    return row;
  }

  async updateSession(
    id: string,
    patch: Partial<
      Pick<DeviceSessionRow, 'status' | 'approvedUserId' | 'intervalSeconds'>
    >,
  ): Promise<void> {
    await this.database.db
      .update(deviceSessions)
      .set(patch)
      .where(eq(deviceSessions.id, id));
  }

  async completeSession(
    id: string,
    fromStatus: DeviceSessionRow['status'],
  ): Promise<boolean> {
    const rows = await this.database.db
      .update(deviceSessions)
      .set({ status: 'complete' })
      .where(
        and(eq(deviceSessions.id, id), eq(deviceSessions.status, fromStatus)),
      )
      .returning({ id: deviceSessions.id });
    return rows.length === 1;
  }

  async upsertGithubUser(identity: GithubIdentity): Promise<UserRow> {
    return this.database.db.transaction(async (tx) => {
      const stale = await tx
        .select({
          id: users.id,
          handle: users.handle,
          githubId: users.githubId,
        })
        .from(users)
        .where(
          and(
            sql`lower(${users.handle}) = lower(${identity.handle})`,
            or(isNull(users.githubId), ne(users.githubId, identity.githubId)),
          ),
        );
      for (const holder of stale) {
        await tx
          .update(users)
          .set({
            handle: parkedHandle(
              holder.handle,
              String(holder.githubId ?? holder.id),
            ),
          })
          .where(eq(users.id, holder.id));
      }
      const [row] = await tx
        .insert(users)
        .values({ id: newId(), ...identity })
        .onConflictDoUpdate({
          target: users.githubId,
          set: {
            handle: identity.handle,
            name: identity.name,
            avatarUrl: identity.avatarUrl,
          },
        })
        .returning();
      return row;
    });
  }

  async findOrCreateDevUser(handle: string): Promise<UserRow> {
    const [existing] = await this.database.db
      .select()
      .from(users)
      .where(sql`lower(${users.handle}) = lower(${handle})`)
      .limit(1);
    if (existing) return existing;
    const [row] = await this.database.db
      .insert(users)
      .values({ id: newId(), handle, name: handle, githubId: null })
      .returning();
    return row;
  }

  async findUser(id: string): Promise<UserRow | undefined> {
    const [row] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row;
  }

  async createDevice(device: NewDevice): Promise<string> {
    const id = newId();
    await this.database.db.insert(devices).values({ id, ...device });
    return id;
  }

  async findActiveDeviceByTokenHash(tokenHash: string) {
    const [row] = await this.database.db
      .select({
        id: devices.id,
        userId: devices.userId,
        publicKey: devices.publicKey,
      })
      .from(devices)
      .where(and(eq(devices.tokenHash, tokenHash), isNull(devices.revokedAt)))
      .limit(1);
    return row;
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.database.db
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(and(eq(devices.id, deviceId), isNull(devices.revokedAt)));
  }

  async recordSignature(signature: string, deviceId: string): Promise<boolean> {
    const rows = await this.database.db
      .insert(uploadSignatures)
      .values({ signature, deviceId })
      .onConflictDoNothing()
      .returning({ signature: uploadSignatures.signature });
    return rows.length === 1;
  }
}
