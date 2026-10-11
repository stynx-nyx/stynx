import { Module } from '@nestjs/common';
import { StynxI18nModule } from '@stynx-nyx/i18n';
import { AppModule } from '../app.module';

@Module({
  imports: [AppModule, StynxI18nModule.forRoot()],
})
export class I18nApplicationModule {}
