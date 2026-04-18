import { defineModule } from '#core/define-module';

import { healthController } from './health.controller';
import { healthService } from './health.service';

export const healthModule = defineModule({
  providers: {
    healthService,
  },
  controller: healthController,
});
