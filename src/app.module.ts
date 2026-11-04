import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { ClientThrottlerGuard } from './common/guards/client-throttler.guard';
import configuration from './config/configuration';
import { THROTTLE } from './config/constants';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health.controller';
import { UsageModule } from './usage/usage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),
    ThrottlerModule.forRoot([{ name: 'default', ...THROTTLE.default }]),
    DatabaseModule,
    AuthModule,
    UsageModule,
    BoardsModule,
    UsersModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ClientThrottlerGuard }],
})
export class AppModule {}
