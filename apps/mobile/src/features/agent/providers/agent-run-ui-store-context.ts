import { createContext } from 'react';

import type { AgentRunUiStore } from '../model/agent-run-ui-store';

export const AgentRunUiStoreContext = createContext<AgentRunUiStore | null>(null);
