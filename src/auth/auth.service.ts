import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DevicePollResponse,
  DeviceStartResponse,
  PublicUser,
} from '@tokenaires/contracts';
import { AppConfig } from '../config/configuration';
import {
  DEVICE_SESSION_INTERVAL_SECONDS,
  DEVICE_SESSION_TTL_SECONDS,
} from '../config/constants';
import { parseDevicePublicKey, sha256Hex } from '../common/utils/crypto';
import { newApiToken, newId, newUserCode } from '../common/utils/ids';
import { DeviceSessionRow, UserRow } from '../database/schema';
import { AuthRepository } from './auth.repository';
import { DevicePollDto } from './dto/device-poll.dto';
import { GithubClient } from './github.client';

type PendingPoll = Exclude<DevicePollResponse, { status: 'complete' }>;
type ResolvedSession =
  { kind: 'user'; user: UserRow } | { kind: 'wait'; response: PendingPoll };

export const toPublicUser = (user: UserRow): PublicUser => ({
  handle: user.handle,
  name: user.name,
  avatarUrl: user.avatarUrl,
  country: user.country,
});

@Injectable()
export class AuthService {
  private readonly app: AppConfig;

  constructor(
    config: ConfigService,
    private readonly repository: AuthRepository,
    private readonly github: GithubClient,
  ) {
    this.app = config.getOrThrow<AppConfig>('app');
  }

  get devLoginEnabled(): boolean {
    return this.app.authDevLogin;
  }

  async start(): Promise<DeviceStartResponse> {
    const id = newId();
    if (this.app.githubClientId) {
      const code = await this.github.requestDeviceCode(this.app.githubClientId);
      await this.repository.createSession({
        id,
        userCode: code.userCode,
        githubDeviceCode: code.deviceCode,
        intervalSeconds: code.interval,
        expiresAt: new Date(Date.now() + code.expiresIn * 1000),
      });
      return { sessionId: id, ...code };
    }
    const userCode = newUserCode();
    await this.repository.createSession({
      id,
      userCode,
      intervalSeconds: DEVICE_SESSION_INTERVAL_SECONDS,
      expiresAt: new Date(Date.now() + DEVICE_SESSION_TTL_SECONDS * 1000),
    });
    return {
      sessionId: id,
      userCode,
      verificationUri: `${this.app.apiPublicUrl}/auth/dev/approve?code=${userCode}`,
      expiresIn: DEVICE_SESSION_TTL_SECONDS,
      interval: DEVICE_SESSION_INTERVAL_SECONDS,
    };
  }

  async poll(dto: DevicePollDto): Promise<DevicePollResponse> {
    if (!parseDevicePublicKey(dto.publicKey)) {
      throw new BadRequestException('Device key must be an Ed25519 public key');
    }
    const session = await this.repository.findSession(dto.sessionId);
    if (!session || session.status === 'complete') return { status: 'expired' };
    if (session.status === 'denied') return { status: 'denied' };
    if (
      session.expiresAt.getTime() < Date.now() ||
      session.status === 'expired'
    ) {
      await this.repository.updateSession(session.id, { status: 'expired' });
      return { status: 'expired' };
    }
    const resolved = await this.resolveUser(session);
    if (resolved.kind === 'wait') return resolved.response;
    const user = resolved.user;
    if (!(await this.repository.completeSession(session.id, 'approved'))) {
      return { status: 'expired' };
    }
    const token = newApiToken();
    const deviceId = await this.repository.createDevice({
      userId: user.id,
      name: dto.deviceName,
      platform: dto.platform,
      publicKey: dto.publicKey,
      tokenHash: sha256Hex(token),
    });
    return { status: 'complete', token, deviceId, user: toPublicUser(user) };
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.repository.revokeDevice(deviceId);
  }

  async approveDev(code: string, handle: string): Promise<string> {
    if (!this.app.authDevLogin) throw new NotFoundException();
    const session = await this.repository.findPendingSessionByCode(code);
    if (!session || session.githubDeviceCode)
      throw new NotFoundException('Code not found');
    const user = await this.repository.findOrCreateDevUser(handle);
    await this.repository.updateSession(session.id, {
      status: 'approved',
      approvedUserId: user.id,
    });
    return user.handle;
  }

  private async resolveUser(
    session: DeviceSessionRow,
  ): Promise<ResolvedSession> {
    const wait = (response: PendingPoll): ResolvedSession => ({
      kind: 'wait',
      response,
    });
    if (session.approvedUserId) {
      const approved = await this.repository.findUser(session.approvedUserId);
      return approved
        ? { kind: 'user', user: approved }
        : wait({ status: 'expired' });
    }
    if (!session.githubDeviceCode || !this.app.githubClientId)
      return wait({ status: 'pending' });
    const result = await this.github.pollAccessToken(
      this.app.githubClientId,
      session.githubDeviceCode,
    );
    if (result.kind === 'pending') return wait({ status: 'pending' });
    if (result.kind === 'slow_down') {
      await this.repository.updateSession(session.id, {
        intervalSeconds: result.interval,
      });
      return wait({ status: 'slow_down', interval: result.interval });
    }
    if (result.kind === 'expired' || result.kind === 'denied') {
      await this.repository.updateSession(session.id, { status: result.kind });
      return wait({ status: result.kind });
    }
    const identity = await this.github.fetchIdentity(result.accessToken);
    const user = await this.repository.upsertGithubUser(identity);
    await this.repository.updateSession(session.id, {
      status: 'approved',
      approvedUserId: user.id,
    });
    return { kind: 'user', user };
  }
}
