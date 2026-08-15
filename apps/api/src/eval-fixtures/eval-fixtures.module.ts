import { Global, Module } from '@nestjs/common';
import { EvalFixtureStore } from './eval-fixture.store';

@Global()
@Module({ providers: [EvalFixtureStore], exports: [EvalFixtureStore] })
export class EvalFixturesModule {}
