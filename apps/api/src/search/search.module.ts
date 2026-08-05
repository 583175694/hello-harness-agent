import { Module } from '@nestjs/common';

import { BochaSearchProvider } from './bocha-search.provider';
import { SearchService } from './search.service';
import { SerperSearchProvider } from './serper-search.provider';

@Module({
  providers: [BochaSearchProvider, SerperSearchProvider, SearchService],
  exports: [SearchService],
})
export class SearchModule {}
