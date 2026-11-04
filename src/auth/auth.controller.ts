import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DevicePollResponse, DeviceStartResponse } from '@tokenaires/contracts';
import { CurrentDevice } from '../common/decorators/current-device.decorator';
import type { AuthenticatedDevice } from '../common/guards/authenticated-device';
import { TokenGuard } from '../common/guards/token.guard';
import { DEV_DEFAULT_HANDLE, THROTTLE } from '../config/constants';
import { AuthService } from './auth.service';
import { DevApproveDto } from './dto/dev-approve.dto';
import { DevicePollDto } from './dto/device-poll.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('device/start')
  @HttpCode(200)
  start(): Promise<DeviceStartResponse> {
    return this.auth.start();
  }

  @Post('device/poll')
  @HttpCode(200)
  @Throttle({ default: THROTTLE.devicePoll })
  poll(@Body() dto: DevicePollDto): Promise<DevicePollResponse> {
    return this.auth.poll(dto);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  async logout(
    @CurrentDevice() device: AuthenticatedDevice,
  ): Promise<{ revoked: true }> {
    await this.auth.revokeDevice(device.deviceId);
    return { revoked: true };
  }

  @Get('dev/approve')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async approveDev(@Query() dto: DevApproveDto): Promise<string> {
    const handle = await this.auth.approveDev(
      dto.code,
      dto.handle ?? DEV_DEFAULT_HANDLE,
    );
    return `Signed in as ${handle}. You can close this tab and go back to your terminal.`;
  }
}
