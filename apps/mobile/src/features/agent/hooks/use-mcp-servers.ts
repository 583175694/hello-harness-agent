import type { McpServerView } from '@harness/agent-protocol';
import { useCallback, useEffect, useState } from 'react';

import { useAgentHost } from './use-agent-host';

export function useMcpServers() {
  const { client, serviceState } = useAgentHost();
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (serviceState !== 'ready') {
      setServers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await client.listMcpServers();
      setServers(response.servers);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '加载 MCP 列表失败');
    } finally {
      setLoading(false);
    }
  }, [client, serviceState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getServer = useCallback(
    (id: string) => servers.find((server) => server.id === id),
    [servers],
  );

  return {
    servers,
    loading,
    error,
    refresh,
    getServer,
    createServer: client.createMcpServer.bind(client),
    updateServer: client.updateMcpServer.bind(client),
    deleteServer: client.deleteMcpServer.bind(client),
    testServer: client.testMcpServer.bind(client),
  };
}
