import { lookup } from 'node:dns/promises';
import { Inject, Injectable } from '@nestjs/common';
import ipaddr from 'ipaddr.js';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import { WEB_FETCH_DNS_RESOLVER, WEB_FETCH_POLICY } from './web-fetch.constants';
import { WebFetchError } from './web-fetch.error';
import type { GuardedWebUrl, WebFetchDnsResolver } from './web-fetch.types';

// 使用系统 DNS 返回全部地址，供 URL Guard 执行确定性分类。
export const systemWebFetchDnsResolver: WebFetchDnsResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

@Injectable()
export class WebFetchUrlGuard {
  constructor(@Inject(WEB_FETCH_DNS_RESOLVER) private readonly resolveDns: WebFetchDnsResolver) {}

  // 校验并规范化一个初始或重定向 URL，任何受限解析结果都会拒绝整个目标。
  async validate(rawUrl: string, redirect = false): Promise<GuardedWebUrl> {
    const rejectCode = redirect
      ? AGENT_ERROR_CODES.fetchRedirectNotAllowed
      : AGENT_ERROR_CODES.fetchUrlNotAllowed;
    if (rawUrl.length > WEB_FETCH_POLICY.maxUrlLength) {
      throw new WebFetchError(AGENT_ERROR_CODES.fetchUrlTooLong, '网页地址超过允许长度。');
    }
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new WebFetchError(rejectCode, '网页地址格式无效。');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new WebFetchError(rejectCode, '仅允许不携带凭据的 HTTP/HTTPS 网页地址。');
    }
    url.hash = '';
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    if (this.isBlockedHostname(hostname)) {
      throw new WebFetchError(AGENT_ERROR_CODES.fetchPrivateAddress, '网页地址指向受限网络。');
    }
    if (ipaddr.isValid(hostname)) this.assertPublicAddress(hostname);
    else {
      let addresses;
      try {
        addresses = await this.resolveDns(hostname);
      } catch {
        throw new WebFetchError(
          AGENT_ERROR_CODES.fetchUpstreamFailed,
          '网页域名暂时无法解析。',
          true,
        );
      }
      if (!addresses.length) {
        throw new WebFetchError(
          AGENT_ERROR_CODES.fetchUpstreamFailed,
          '网页域名没有可用地址。',
          true,
        );
      }
      for (const address of addresses) this.assertPublicAddress(address.address);
    }
    const normalizedUrl = url.toString();
    return { requestedUrl: rawUrl, normalizedUrl, url };
  }

  // 拒绝本地域名和常见云平台 Metadata 主机名。
  private isBlockedHostname(hostname: string): boolean {
    const exact = new Set([
      'localhost',
      'metadata.google.internal',
      'metadata.google.internal.',
      'instance-data.ec2.internal',
      '169.254.169.254',
    ]);
    return (
      exact.has(hostname) ||
      ['.localhost', '.local', '.internal', '.home.arpa'].some((suffix) =>
        hostname.endsWith(suffix),
      )
    );
  }

  // 仅接受 ipaddr.js 分类为公网单播的 IPv4/IPv6 地址。
  private assertPublicAddress(value: string): void {
    let address;
    try {
      address = ipaddr.parse(value);
    } catch {
      throw new WebFetchError(AGENT_ERROR_CODES.fetchPrivateAddress, '网页地址解析结果无效。');
    }
    const ipv6Address = address.kind() === 'ipv6' ? (address as ipaddr.IPv6) : undefined;
    if (ipv6Address?.isIPv4MappedAddress()) {
      address = ipv6Address.toIPv4Address();
    }
    if (address.range() !== 'unicast') {
      throw new WebFetchError(AGENT_ERROR_CODES.fetchPrivateAddress, '网页地址指向受限网络。');
    }
  }
}
