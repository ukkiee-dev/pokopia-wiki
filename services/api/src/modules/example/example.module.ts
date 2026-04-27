import { defineModule } from '#core/define-module';

import { exampleController } from './example.controller';
import { exampleRepository } from './example.repository';
import { exampleService } from './example.service';

export const exampleModule = defineModule({
  providers: {
    exampleService,
    exampleRepository,
  },
  controller: exampleController,
});
